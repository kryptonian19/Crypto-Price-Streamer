# Submission Comments

## Implementation Approach

### Architecture Decisions

1. **REST API with Server-Sent Events**: Used REST API for standard CRUD operations and Server-Sent Events for real-time price streaming, providing excellent browser compatibility and low latency push-based updates.

2. **Single Playwright Instance**: Implemented efficient resource sharing by using a single browser instance with multiple pages (one per ticker), which scales well for concurrent clients.

3. **Real-time Data Extraction**: Playwright monitors TradingView pages with 1-second intervals, providing near real-time price updates with multiple fallback extraction methods for reliability.

4. **Fastify for Performance**: Chosen Fastify for its excellent performance, built-in CORS support, and native compatibility with Server-Sent Events.

### Key Features Implemented

✅ **Real-time Price Streaming**: Uses Server-Sent Events for push-based updates
✅ **Headed Browser Automation**: Playwright runs in visible mode as requested
✅ **Alphabetical Sorting**: UI automatically sorts tickers alphabetically
✅ **Error Handling**: Comprehensive error handling with user feedback
✅ **Scalable Architecture**: Efficient browser resource sharing
✅ **Low Latency**: Push-based updates minimize delay
✅ **Logging**: Console logging on both frontend and backend
✅ **Graceful Shutdown**: Proper cleanup of browser resources

### Technical Highlights

1. **Efficient Scraping**: Uses data attributes and CSS selectors to reliably extract price data from TradingView pages.

2. **Connection Management**: Implements proper connection lifecycle management with cleanup on client disconnect.

3. **Type Safety**: Full TypeScript implementation with proper interface definitions for all data structures.

4. **Development Experience**: Hot reload for both frontend and backend during development.

### Potential Improvements

If this were a production system, I would consider:

1. **Rate Limiting**: Implement proper rate limiting to respect TradingView's terms of service
2. **Caching**: Add Redis for price data caching and state persistence
3. **Authentication**: Add user authentication and session management
4. **Database**: Store ticker preferences and historical data
5. **Monitoring**: Add metrics and health checks for production monitoring
6. **Docker**: Containerization for easier deployment

### Testing the Application

To test the functionality:

1. Start the application with `./run.sh` or `.\run.ps1`
2. Navigate to http://localhost:3000
3. Add tickers like "BTCUSD", "ETHUSD", "SOLUSD"
4. Observe real-time price updates in the browser
5. Watch the headed Playwright browser windows showing TradingView pages
6. Test removing tickers and adding invalid tickers for error handling

The application demonstrates scalable real-time data streaming with efficient resource management, which aligns well with the requirements for a data processing pipeline at Project Pluto.
