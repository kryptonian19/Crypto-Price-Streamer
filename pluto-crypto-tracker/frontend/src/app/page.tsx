'use client';

import { useState, useEffect } from 'react';
import { createPromiseClient } from '@connectrpc/connect';
import { createGrpcWebTransport } from '@connectrpc/connect-web';
import { 
  AddTickerRequest,
  RemoveTickerRequest,
  GetTickersRequest
} from '../gen/proto/crypto_service_pb';
import { CryptoPriceService } from '../gen/proto/crypto_service_connect';

interface TickerData {
  ticker: string;
  price: number;
  changePercent: number;
  timestamp: number;
}

const API_BASE = 'http://localhost:8080/api';
const CONNECTRPC_BASE = 'http://localhost:8080';

// Create ConnectRPC client
const transport = createGrpcWebTransport({
  baseUrl: CONNECTRPC_BASE,
});

const client = createPromiseClient(CryptoPriceService, transport);

export default function Home() {
  const [tickers, setTickers] = useState<TickerData[]>([]);
  const [newTicker, setNewTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  // Load existing tickers on component mount
  useEffect(() => {
    loadTickers();
  }, []);

  // Set up Server-Sent Events for real-time price streaming
  useEffect(() => {
    console.log('🔄 Setting up price streaming...');
    
    const eventSource = new EventSource(`${API_BASE}/stream`);
    
    eventSource.onopen = () => {
      console.log('✅ Connected to price stream');
      setConnected(true);
      setError(null);
    };
    
    eventSource.onmessage = (event) => {
      try {
        console.log('📡 Raw SSE data received:', event.data);
        const data = JSON.parse(event.data);
        
        if (data.type === 'connected') {
          console.log('🤝 SSE connection confirmed, client ID:', data.clientId);
          return;
        }
        
        // Handle batch updates for optimized performance
        if (data.type === 'batch_update' && data.updates) {
          console.log(`📦 Received batch update with ${data.updates.length} price changes`);
          
          setTickers(prevTickers => {
            const newTickers = [...prevTickers];
            
            // Process all updates in the batch
            data.updates.forEach((updateData: any) => {
              const update: TickerData = {
                ticker: updateData.ticker,
                price: updateData.price,
                changePercent: updateData.changePercent,
                timestamp: updateData.timestamp
              };
              
              const existingIndex = newTickers.findIndex(t => t.ticker === update.ticker);
              
              if (existingIndex >= 0) {
                newTickers[existingIndex] = update;
              } else {
                newTickers.push(update);
              }
            });
            
            // Sort alphabetically as required
            const sorted = newTickers.sort((a, b) => a.ticker.localeCompare(b.ticker));
            console.log(`⚡ Batch processed ${data.updates.length} updates - Active tickers: ${sorted.length}`);
            return sorted;
          });
          
          return;
        }
        
        // Handle single price update (backward compatibility)
        const update: TickerData = {
          ticker: data.ticker,
          price: data.price,
          changePercent: data.changePercent,
          timestamp: data.timestamp
        };
        
        console.log('💰 Received single price update:', {
          ticker: update.ticker,
          price: `$${update.price}`,
          change: `${update.changePercent}%`,
          time: new Date(update.timestamp).toLocaleTimeString()
        });
        
        setTickers(prevTickers => {
          const newTickers = [...prevTickers];
          const existingIndex = newTickers.findIndex(t => t.ticker === update.ticker);
          
          if (existingIndex >= 0) {
            newTickers[existingIndex] = update;
            console.log(`🔄 Updated existing ticker: ${update.ticker}`);
          } else {
            newTickers.push(update);
            console.log(`➕ Added new ticker: ${update.ticker}`);
          }
          
          // Sort alphabetically as required
          const sorted = newTickers.sort((a, b) => a.ticker.localeCompare(b.ticker));
          return sorted;
        });
      } catch (error) {
        console.error('❌ Error parsing SSE data:', error);
        console.error('Raw event data:', event.data);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('❌ SSE connection error:', error);
      console.error('EventSource state:', eventSource.readyState);
      setConnected(false);
      setError('Lost connection to price stream. Retrying...');
    };
    
    return () => {
      console.log('🔌 Closing SSE connection');
      eventSource.close();
      setConnected(false);
    };
  }, []);

  const loadTickers = async () => {
    try {
      console.log('Loading existing tickers using ConnectRPC...');
      const request = new GetTickersRequest({});
      const response = await client.getTickers(request);
      
      const tickerData: TickerData[] = response.tickers.map((ticker: string) => ({
        ticker,
        price: 0,
        changePercent: 0,
        timestamp: Date.now()
      }));
      
      setTickers(tickerData.sort((a, b) => a.ticker.localeCompare(b.ticker)));
      console.log('Loaded tickers via ConnectRPC:', response.tickers);
    } catch (error) {
      console.error('Error loading tickers via ConnectRPC:', error);
      setError('Failed to load existing tickers');
    }
  };

  const addTicker = async () => {
    if (!newTicker.trim()) return;

    setLoading(true);
    setError(null);
    
    try {
      console.log(`Adding ticker via ConnectRPC: ${newTicker.toUpperCase()}`);
      const request = new AddTickerRequest({
        ticker: newTicker.toUpperCase()
      });
      const response = await client.addTicker(request);
      
      if (response.success) {
        setNewTicker('');
        console.log('Ticker added successfully via ConnectRPC:', response.message);
        // Refresh ticker list
        await loadTickers();
      } else {
        setError(response.message);
        console.error('Failed to add ticker via ConnectRPC:', response.message);
      }
    } catch (error) {
      console.error('Error adding ticker via ConnectRPC:', error);
      setError('Failed to add ticker. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const removeTicker = async (ticker: string) => {
    try {
      console.log(`Removing ticker via ConnectRPC: ${ticker}`);
      const request = new RemoveTickerRequest({
        ticker: ticker
      });
      const response = await client.removeTicker(request);
      
      if (response.success) {
        setTickers(prev => prev.filter(t => t.ticker !== ticker));
        console.log('Ticker removed successfully via ConnectRPC:', response.message);
      } else {
        setError(response.message);
        console.error('Failed to remove ticker via ConnectRPC:', response.message);
      }
    } catch (error) {
      console.error('Error removing ticker via ConnectRPC:', error);
      setError('Failed to remove ticker. Please try again.');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addTicker();
    }
  };

  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 8
    }).format(price);
  };

  const formatChange = (changePercent: number): string => {
    const sign = changePercent >= 0 ? '+' : '';
    return `${sign}${changePercent.toFixed(2)}%`;
  };

  const getChangeClass = (changePercent: number): string => {
    if (changePercent > 0) return 'positive';
    if (changePercent < 0) return 'negative';
    return 'neutral';
  };

  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Crypto Price Tracker</h1>
        <p>Real-time cryptocurrency prices from TradingView</p>
        <p className={`status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '🟢 Connected' : '🔴 Disconnected'}
        </p>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="ticker-input">
        <input
          type="text"
          placeholder="Enter ticker symbol (e.g., BTCUSD, ETHUSD)"
          value={newTicker}
          onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
          onKeyPress={handleKeyPress}
          disabled={loading}
        />
        <button onClick={addTicker} disabled={loading || !newTicker.trim()}>
          {loading ? 'Adding...' : 'Add Ticker'}
        </button>
      </div>

      <div className="ticker-grid">
        {tickers.length === 0 ? (
          <div className="no-tickers">
            No tickers added yet. Add a cryptocurrency symbol to start tracking prices.
          </div>
        ) : (
          tickers.map((ticker) => (
            <div key={ticker.ticker} className="ticker-card">
              <div className="ticker-header">
                <span className="ticker-symbol">{ticker.ticker}</span>
                <button 
                  className="remove-btn"
                  onClick={() => removeTicker(ticker.ticker)}
                >
                  Remove
                </button>
              </div>
              
              <div className={`price ${getChangeClass(ticker.changePercent)}`}>
                {ticker.price > 0 ? formatPrice(ticker.price) : 'Loading...'}
              </div>
              
              {ticker.price > 0 && (
                <>
                  <div className={`change ${getChangeClass(ticker.changePercent)}`}>
                    {formatChange(ticker.changePercent)}
                  </div>
                  <div className="timestamp">
                    Last updated: {formatTimestamp(ticker.timestamp)}
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
