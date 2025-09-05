import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import { ConnectRouter } from '@connectrpc/connect';
import { TradingViewScraper, PriceData } from './tradingview-scraper.js';
import { 
  AddTickerRequest,
  AddTickerResponse,
  RemoveTickerRequest,
  RemoveTickerResponse,
  GetTickersRequest,
  GetTickersResponse,
  StreamPricesRequest,
  PriceUpdate
} from './gen/proto/crypto_service_pb.js';
import { CryptoPriceService } from './gen/proto/crypto_service_connect.js';

const PORT = 8080;
const HOST = '0.0.0.0';

interface SSEClient {
  id: string;
  reply: any;
  lastActivity: number;
  isActive: boolean;
}

interface BroadcastQueue {
  data: PriceData[];
  timestamp: number;
}

const BROADCAST_BATCH_SIZE = 10;
const CLIENT_TIMEOUT = 60000; // 60 seconds
const BROADCAST_INTERVAL = 50; // 50ms batching

async function main() {
  console.log('Starting Pluto Crypto Tracker Backend...');
  
  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty'
      }
    }
  });

  // Register CORS with ConnectRPC headers support
  await fastify.register(cors, {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization',
      'Connect-Protocol-Version',
      'Connect-Timeout-Ms',
      'Connect-Accept-Encoding',
      'Connect-User-Agent',
      'Connect-Content-Encoding',
      'X-Connect-Protocol-Version',
      'X-User-Agent',
      'X-Grpc-Web'
    ],
    credentials: true,
    exposedHeaders: [
      'Connect-Protocol-Version',
      'Connect-Timeout-Ms',
      'Connect-Accept-Encoding',
      'Connect-Content-Encoding'
    ]
  });

  // Initialize scraper
  const scraper = new TradingViewScraper();
  await scraper.initialize();
  
  // Store active SSE clients with optimized management
  const sseClients: Map<string, SSEClient> = new Map();
  const broadcastQueue: PriceData[] = [];
  let broadcastTimer: NodeJS.Timeout | null = null;
  
  // Optimized broadcasting function with batching
  const broadcastToClients = (updates: PriceData[]) => {
    if (sseClients.size === 0 || updates.length === 0) return;
    
    const now = Date.now();
    const staleClients: string[] = [];
    
    // Batch message for efficiency
    const batchMessage = JSON.stringify({
      type: 'batch_update',
      updates: updates,
      timestamp: now
    });
    
    let successfulBroadcasts = 0;
    
    // Efficiently broadcast to all clients
    sseClients.forEach((client, clientId) => {
      // Check for stale connections
      if (now - client.lastActivity > CLIENT_TIMEOUT && !client.isActive) {
        staleClients.push(clientId);
        return;
      }
      
      try {
        client.reply.raw.write(`data: ${batchMessage}\n\n`);
        client.lastActivity = now;
        client.isActive = true;
        successfulBroadcasts++;
      } catch (error) {
        console.warn(`Failed to send to client ${clientId}:`, error.message);
        staleClients.push(clientId);
      }
    });
    
    // Clean up stale clients
    staleClients.forEach(clientId => {
      console.log(`Removing stale client: ${clientId}`);
      sseClients.delete(clientId);
    });
    
    if (successfulBroadcasts > 0) {
      console.log(`📡 Batched ${updates.length} price updates to ${successfulBroadcasts} clients`);
    }
  };
  
  // Process broadcast queue with batching
  const processBroadcastQueue = () => {
    if (broadcastQueue.length === 0) return;
    
    // Take all queued updates
    const updates = broadcastQueue.splice(0, broadcastQueue.length);
    
    // Group by ticker to avoid duplicate updates
    const latestUpdates = new Map<string, PriceData>();
    updates.forEach(update => {
      latestUpdates.set(update.ticker, update);
    });
    
    // Broadcast the latest state for each ticker
    broadcastToClients(Array.from(latestUpdates.values()));
  };
  
  // Set up optimized price update handling
  scraper.onPriceUpdate((data: PriceData) => {
    // Queue update for batched processing
    broadcastQueue.push(data);
    
    // Schedule batch processing if not already scheduled
    if (!broadcastTimer) {
      broadcastTimer = setTimeout(() => {
        processBroadcastQueue();
        broadcastTimer = null;
      }, BROADCAST_INTERVAL);
    }
  });

  // Create ConnectRPC router with service implementation
  const connectRouter = (router: ConnectRouter) => {
    router.service(CryptoPriceService, {
      // Add ticker implementation
      async addTicker(request: AddTickerRequest) {
        try {
          const { ticker } = request;
          console.log(`ConnectRPC request to add ticker: ${ticker}`);
          await scraper.addTicker(ticker);
          return new AddTickerResponse({
            success: true,
            message: `Successfully added ticker ${ticker}`
          });
        } catch (error) {
          console.error('Failed to add ticker:', error);
          return new AddTickerResponse({
            success: false,
            message: `Failed to add ticker: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      },
      
      // Remove ticker implementation
      async removeTicker(request: RemoveTickerRequest) {
        try {
          const { ticker } = request;
          console.log(`ConnectRPC request to remove ticker: ${ticker}`);
          await scraper.removeTicker(ticker);
          return new RemoveTickerResponse({
            success: true,
            message: `Successfully removed ticker ${ticker}`
          });
        } catch (error) {
          console.error('Failed to remove ticker:', error);
          return new RemoveTickerResponse({
            success: false,
            message: `Failed to remove ticker: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      },
      
      // Get tickers implementation
      async getTickers(request: GetTickersRequest) {
        const tickers = scraper.getActiveTickers();
        console.log(`ConnectRPC request for active tickers: ${tickers.join(', ')}`);
        return new GetTickersResponse({
          tickers
        });
      },
      
      // Stream prices implementation - server streaming
      async *streamPrices(request: StreamPricesRequest, context: any) {
        console.log('ConnectRPC client connected to price stream');
        
        const clientId = Math.random().toString(36).substring(7);
        const priceUpdates: PriceData[] = [];
        
        // Set up price update listener for this stream
        const updateListener = (data: PriceData) => {
          priceUpdates.push(data);
        };
        
        scraper.onPriceUpdate(updateListener);
        
        try {
          // Stream price updates as they come
          let lastSentIndex = 0;
          
          while (!context.signal.aborted) {
            // Send any new updates
            while (lastSentIndex < priceUpdates.length) {
              const update = priceUpdates[lastSentIndex];
              yield new PriceUpdate({
                ticker: update.ticker,
                price: update.price,
                changePercent: update.changePercent,
                timestamp: BigInt(update.timestamp)
              });
              lastSentIndex++;
            }
            
            // Wait a bit before checking for new updates
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } finally {
          console.log(`ConnectRPC client ${clientId} disconnected from price stream`);
          // Clean up the listener
          // Note: In a real implementation, you'd want to properly remove the listener
        }
      }
    });
  };
  
  // Register ConnectRPC plugin
  await fastify.register(fastifyConnectPlugin, {
    routes: connectRouter
  });
  
  // Keep REST API endpoints for backward compatibility during transition
  // Add ticker
  fastify.post('/api/tickers', async (request, reply) => {
    try {
      const { ticker } = request.body as { ticker: string };
      console.log(`REST request to add ticker: ${ticker}`);
      await scraper.addTicker(ticker);
      return { success: true, message: `Successfully added ticker ${ticker}` };
    } catch (error) {
      console.error('Failed to add ticker:', error);
      reply.status(400);
      return { success: false, message: `Failed to add ticker: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  });
  
  // Remove ticker
  fastify.delete('/api/tickers/:ticker', async (request, reply) => {
    try {
      const { ticker } = request.params as { ticker: string };
      console.log(`REST request to remove ticker: ${ticker}`);
      await scraper.removeTicker(ticker);
      return { success: true, message: `Successfully removed ticker ${ticker}` };
    } catch (error) {
      console.error('Failed to remove ticker:', error);
      reply.status(400);
      return { success: false, message: `Failed to remove ticker: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  });
  
  // Get all tickers
  fastify.get('/api/tickers', async (request, reply) => {
    const tickers = scraper.getActiveTickers();
    console.log(`REST request for active tickers: ${tickers.join(', ')}`);
    return { tickers };
  });
  
  // Server-Sent Events endpoint for real-time price updates
  fastify.get('/api/stream', (request, reply) => {
    console.log('New client connected to price stream');
    
    const clientId = Math.random().toString(36).substring(7);
    
    // Set proper SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': 'http://localhost:3000',
      'Access-Control-Allow-Headers': 'Cache-Control, Content-Type',
      'Access-Control-Allow-Credentials': 'true'
    });
    
    // Add client to active connections with proper initialization
    sseClients.set(clientId, { 
      id: clientId, 
      reply,
      lastActivity: Date.now(),
      isActive: true
    });
    
    // Send initial connection confirmation
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);
    
    let keepAlive: NodeJS.Timeout;
    
    // Keep connection alive
    keepAlive = setInterval(() => {
      if (sseClients.has(clientId)) {
        try {
          reply.raw.write(`: keep-alive\n\n`);
        } catch (error) {
          console.error('Keep-alive error:', error);
          clearInterval(keepAlive);
          sseClients.delete(clientId);
        }
      } else {
        clearInterval(keepAlive);
      }
    }, 30000); // Send keep-alive every 30 seconds
    
    // Handle client disconnect
    request.socket.on('close', () => {
      console.log(`Client ${clientId} disconnected from price stream`);
      sseClients.delete(clientId);
      if (keepAlive) clearInterval(keepAlive);
    });
    
    request.socket.on('error', (error) => {
      console.error(`Client ${clientId} socket error:`, error);
      sseClients.delete(clientId);
      if (keepAlive) clearInterval(keepAlive);
    });
  });

  // Health check endpoint
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Performance monitoring endpoint
  fastify.get('/api/performance', async (request, reply) => {
    const metrics = scraper.getPerformanceMetrics();
    return {
      scraper: metrics,
      server: {
        activeSSEClients: sseClients.size,
        queuedBroadcasts: broadcastQueue.length,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      },
      timestamp: new Date().toISOString()
    };
  });

  // Graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    try {
      await scraper.close();
      await fastify.close();
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`🚀 Server running on http://${HOST}:${PORT}`);
    console.log(`📡 REST API endpoints available at http://${HOST}:${PORT}/api/*`);
    console.log(`🔌 ConnectRPC services available at http://${HOST}:${PORT}/crypto.v1.CryptoPriceService/*`);
    console.log(`🔄 Real-time stream at http://${HOST}:${PORT}/api/stream`);
    console.log(`🔄 ConnectRPC streaming at http://${HOST}:${PORT}/crypto.v1.CryptoPriceService/StreamPrices`);
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
