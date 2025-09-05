import { chromium, Browser, Page, BrowserContext } from 'playwright';

export interface PriceData {
  ticker: string;
  price: number;
  changePercent: number;
  timestamp: number;
}

interface TickerState {
  lastPrice: number;
  lastChange: number;
  lastUpdate: number;
  monitoringActive: boolean;
  page: Page | null;
}

export class TradingViewScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private activeTickers: Map<string, TickerState> = new Map();
  private priceCallbacks: Set<(data: PriceData) => void> = new Set();
  private updateQueue: Map<string, PriceData> = new Map();
  private batchUpdateTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_DELAY = 50; // Batch updates every 50ms
  private readonly UPDATE_INTERVAL = 1000; // Check for updates every 1 second for real scraping

  async initialize(): Promise<void> {
    console.log('🚀 Initializing REAL TradingView price scraper...');
    this.browser = await chromium.launch({
      headless: false, // Run in headed mode as required
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    
    console.log('✅ Real TradingView scraper initialized successfully');
  }

  async addTicker(ticker: string): Promise<void> {
    if (!this.context) {
      throw new Error('Scraper not initialized');
    }

    if (this.activeTickers.has(ticker)) {
      console.log(`📈 Ticker ${ticker} already being tracked`);
      return;
    }

    console.log(`➕ Adding ticker for REAL price monitoring: ${ticker}`);
    
    try {
      // Create a new page for this ticker
      const page = await this.context.newPage();
      
      // Navigate to the specific TradingView symbol page
      const url = `https://www.tradingview.com/symbols/${ticker}/?exchange=BINANCE`;
      console.log(`🌐 Navigating to: ${url}`);
      
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000); // Wait for page to fully load
      
      // Add ticker to our tracking list
      this.activeTickers.set(ticker, {
        lastPrice: 0,
        lastChange: 0,
        lastUpdate: 0,
        monitoringActive: true,
        page: page
      });

      // Start monitoring this specific ticker
      await this.startRealTimeMonitoring(ticker, page);
      
      console.log(`✅ Successfully added ticker: ${ticker} for real-time monitoring`);
    } catch (error) {
      console.error(`❌ Error adding ticker ${ticker}:`, error);
      throw error;
    }
  }

  private async startRealTimeMonitoring(ticker: string, page: Page): Promise<void> {
    console.log(`🔍 Starting REAL price monitoring for ${ticker}`);
    
    // Extract initial price
    const initialPrice = await this.extractRealPriceData(ticker, page);
    if (initialPrice) {
      this.queuePriceUpdate(initialPrice);
    }

    // Set up periodic monitoring for real prices
    const monitoringInterval = setInterval(async () => {
      try {
        const priceData = await this.extractRealPriceData(ticker, page);
        if (priceData) {
          const state = this.activeTickers.get(ticker);
          if (state && state.monitoringActive) {
            // Only update if price has changed
            if (priceData.price !== state.lastPrice || priceData.changePercent !== state.lastChange) {
              state.lastPrice = priceData.price;
              state.lastChange = priceData.changePercent;
              state.lastUpdate = priceData.timestamp;
              
              this.queuePriceUpdate(priceData);
              console.log(`💰 REAL price update for ${ticker}: $${priceData.price} (${priceData.changePercent}%)`);
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error monitoring ${ticker}:`, error);
      }
    }, this.UPDATE_INTERVAL);

    // Clean up interval when page is closed
    page.on('close', () => {
      clearInterval(monitoringInterval);
    });
  }

  private async extractRealPriceData(ticker: string, page: Page): Promise<PriceData | null> {
    try {
      console.log(`🔍 Extracting REAL price data for ${ticker}...`);
      
      // Strategy 1: Try to find the main price using TradingView's current selectors
      let price = 0;
      let changePercent = 0;
      
      // Wait for the price element to be available
      try {
        await page.waitForSelector('[data-symbol-ticker]', { timeout: 5000 });
      } catch (e) {
        console.log(`⚠️ Symbol ticker selector not found for ${ticker}`);
      }

      // Try multiple selector strategies for price
      const priceSelectors = [
        '[data-symbol-last]',
        '[class*="last-"][class*="price"]',
        '[class*="Last-"][class*="price"]',
        '.tv-symbol-header__last-price',
        '.js-symbol-last',
        '[data-field="last_price"]',
        '.tv-category-header__price-line .tv-category-header__price',
        '.tv-symbol-price-quote__value'
      ];

      for (const selector of priceSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const text = await element.textContent();
            if (text) {
            const cleanText = text.trim().replace(/[^\d.,]/g, '');
              const numericValue = parseFloat(cleanText.replace(/,/g, ''));
              
              if (!isNaN(numericValue) && numericValue > 0) {
                price = numericValue;
                console.log(`✅ Found REAL price for ${ticker}: $${price} using selector: ${selector}`);
                break;
              }
            }
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      // Try multiple selector strategies for change percentage
      const changeSelectors = [
        '[data-symbol-change-pt]',
        '[class*="change"][class*="percent"]',
        '[class*="Change"][class*="percent"]',
        '.tv-symbol-header__change--percent',
        '.js-symbol-change-pt',
        '.tv-category-header__change-percent',
        '.tv-symbol-price-quote__change-percent'
      ];

      for (const selector of changeSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const text = await element.textContent();
            if (text) {
              const match = text.match(/([+-]?[\d.]+)%/);
              if (match) {
                changePercent = parseFloat(match[1]);
                console.log(`✅ Found REAL change for ${ticker}: ${changePercent}%`);
                break;
              }
            }
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      // If direct selectors fail, try JavaScript execution for dynamic content
      if (price === 0) {
        console.log(`🔍 Trying JavaScript execution for ${ticker}...`);
        
        const jsData = await page.evaluate(() => {
          // Look for TradingView data in window objects
          const win = window as any;
          
          // Try various TradingView data sources
          if (win.TradingView && win.TradingView.symbol) {
            return {
              price: parseFloat(win.TradingView.symbol.last) || 0,
              change: parseFloat(win.TradingView.symbol.change_percent) || 0
            };
          }

          // Try to find price in text content
          const priceElements = document.querySelectorAll('*');
          for (const element of priceElements) {
            const text = element.textContent || '';
            // Look for USD prices with decimal places
            const priceMatch = text.match(/\$?([\d,]+\.[\d]{2,8})/);
            if (priceMatch) {
              const val = parseFloat(priceMatch[1].replace(/,/g, ''));
              if (val > 0.01 && val < 200000) { // Reasonable crypto price range
                // Look for change percentage nearby
                const parentText = element.parentElement?.textContent || '';
                const changeMatch = parentText.match(/([+-][\d.]+)%/);
                return {
                  price: val,
                  change: changeMatch ? parseFloat(changeMatch[1]) : 0
                };
              }
            }
          }
          
          return { price: 0, change: 0 };
        });

        if (jsData.price > 0) {
          price = jsData.price;
          changePercent = jsData.change;
          console.log(`✅ Found REAL price via JavaScript for ${ticker}: $${price} (${changePercent}%)`);
        }
      }

      // If we still don't have real data, try parsing from page title
      if (price === 0) {
        const title = await page.title();
        console.log(`🔍 Trying to extract from title for ${ticker}: "${title}"`);
        
        const titlePriceMatch = title.match(/([\d,]+\.[\d]{2,8})/);
        if (titlePriceMatch) {
          const titlePrice = parseFloat(titlePriceMatch[1].replace(/,/g, ''));
          if (titlePrice > 0) {
            price = titlePrice;
            console.log(`✅ Found REAL price in title for ${ticker}: $${price}`);
          }
        }
      }

      // If still no real price found, this is an error
      if (price === 0) {
        console.error(`❌ FAILED to extract real price for ${ticker} from TradingView`);
        return null;
      }

      return {
        ticker,
        price: Number(price.toFixed(price > 1 ? 2 : 8)),
        changePercent: Number(changePercent.toFixed(2)),
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`❌ Error extracting REAL price data for ${ticker}:`, error);
      return null;
    }
  }

  async removeTicker(ticker: string): Promise<void> {
    console.log(`➖ Removing ticker from monitoring: ${ticker}`);
    
    const state = this.activeTickers.get(ticker);
    if (state) {
      // Close the page for this ticker
      if (state.page) {
        await state.page.close();
      }
      
      this.activeTickers.delete(ticker);
      console.log(`✅ Successfully removed ticker: ${ticker}`);
    }
  }

  private queuePriceUpdate(data: PriceData): void {
    // Add to update queue
    this.updateQueue.set(data.ticker, data);
    
    // Process batch updates with minimal delay
    if (this.batchUpdateTimer) {
      clearTimeout(this.batchUpdateTimer);
    }
    
    this.batchUpdateTimer = setTimeout(() => {
      this.processBatchedUpdates();
    }, this.BATCH_DELAY);
  }

  private processBatchedUpdates(): void {
    if (this.updateQueue.size === 0) return;

    // Process all queued updates
    const updates = Array.from(this.updateQueue.values());
    this.updateQueue.clear();

    // Notify all callbacks with batched updates
    for (const update of updates) {
      this.notifyPriceUpdate(update);
    }
  }

  onPriceUpdate(callback: (data: PriceData) => void): void {
    this.priceCallbacks.add(callback);
  }

  private notifyPriceUpdate(data: PriceData): void {
    this.priceCallbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in price update callback:', error);
      }
    });
  }

  async close(): Promise<void> {
    console.log('🔌 Closing REAL TradingView scraper...');
    
    // Clear intervals
    if (this.batchUpdateTimer) {
      clearTimeout(this.batchUpdateTimer);
      this.batchUpdateTimer = null;
    }

    // Close all ticker pages
    for (const [ticker, state] of this.activeTickers) {
      if (state.page) {
        await state.page.close();
      }
    }
    
    if (this.context) {
      await this.context.close();
    }
    
    if (this.browser) {
      await this.browser.close();
    }
    
    // Clear state
    this.activeTickers.clear();
    this.priceCallbacks.clear();
    this.updateQueue.clear();
    
    console.log('✅ REAL TradingView scraper closed');
  }

  getActiveTickers(): string[] {
    return Array.from(this.activeTickers.keys()).sort();
  }

  // Performance monitoring methods
  getPerformanceMetrics() {
    return {
      activeTickers: this.activeTickers.size,
      callbacksRegistered: this.priceCallbacks.size,
      queuedUpdates: this.updateQueue.size,
      monitoringActive: true
    };
  }
}
