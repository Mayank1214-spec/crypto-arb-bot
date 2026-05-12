const fs = require('fs');
const path = 'c:/projects/cr_arb/crypto-arb/backend/src/ArbitrageEngine.ts';

let content = fs.readFileSync(path, 'utf8');

content = content.replace(`interface PriceData {
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;`, `interface PriceData {
  bids: [number, number][];
  asks: [number, number][];`);

content = content.replace(`  potentialProfit: number;
}`, `  potentialProfit: number;
  layersConsumed: number;
}`);

content = content.replace(`channels: batch.map(s => \`ticker.\${s}.100ms\`)`, `channels: batch.flatMap(s => [\`ticker.\${s}.100ms\`, \`book.\${s}.none.10.100ms\`])`);

content = content.replace(`        if (response.params && response.params.channel.startsWith("ticker")) {
          this.updatePrice("Deribit", response.params.data);
        }`, `        if (response.params && response.params.channel.startsWith("ticker")) {
          this.updateTicker("Deribit", response.params.data);
        } else if (response.params && response.params.channel.startsWith("book")) {
          this.updateDepth("Deribit", response.params.data, "snapshot");
        }`);

content = content.replace(`args: batch.map(s => \`tickers.\${s}\`)`, `args: batch.flatMap(s => [\`tickers.\${s}\`, \`orderbook.25.\${s}\`])`);

content = content.replace(`        if (response.topic && response.topic.startsWith("tickers")) {
          const rawData = response.data;
          this.updatePrice("Bybit", rawData);
        }`, `        if (response.topic && response.topic.startsWith("tickers")) {
          this.updateTicker("Bybit", response.data);
        } else if (response.topic && response.topic.startsWith("orderbook")) {
          this.updateDepth("Bybit", response.data, response.type);
        }`);

content = content.replace(`  private updatePrice(exchange: string, rawData: any) {`, `  private updateDepth(exchange: string, rawData: any, type: string) {
    const rawSymbol = rawData.s || rawData.instrument_name || rawData.symbol;
    if (!rawSymbol) return;
    try {
      let contract;
      if (exchange === "Deribit") contract = this.parseDeribitSymbol(rawSymbol);
      else if (exchange === "Bybit") contract = this.parseBybitSymbol(rawSymbol);
      else return;

      const key = this.getNormalizedKey(contract);
      let entries = this.prices.get(key) || [];
      let priceData = entries.find(e => e.exchange === exchange);
      
      if (!priceData) {
        priceData = { bids: [], asks: [], bidIv: 0, askIv: 0, underlyingPrice: 0, delta: 0, exchange, timestamp: Date.now() };
        entries.push(priceData);
      }

      if (exchange === "Deribit") {
        if (rawData.bids) priceData.bids = rawData.bids.map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]);
        if (rawData.asks) priceData.asks = rawData.asks.map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]);
      } else if (exchange === "Bybit") {
        if (type === "snapshot" || (rawData.b && rawData.b.length > 5)) {
          if (rawData.b) priceData.bids = rawData.b.map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]);
          if (rawData.a) priceData.asks = rawData.a.map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]);
        }
      }
      
      priceData.timestamp = Date.now();
      this.prices.set(key, entries);
      if (priceData.asks.length > 0 && priceData.bids.length > 0) {
        this.checkArbitrage(key, contract, entries);
      }
    } catch(e) {}
  }

  private updateTicker(exchange: string, rawData: any) {`);

content = content.replace(`      const price: PriceData = {
        bid,
        bidSize: parseFloat(rawData.B || rawData.best_bid_amount || rawData.bidSize || rawData.bid1Size || 0),
        ask,
        askSize: parseFloat(rawData.A || rawData.best_ask_amount || rawData.askSize || rawData.ask1Size || 0),
        bidIv,
        askIv,
        underlyingPrice,
        delta: parseFloat(rawData.delta || (rawData.greeks && rawData.greeks.delta) || 0),
        exchange,
        timestamp: Date.now()
      };

      let entries = this.prices.get(normalizedKey) || [];
      entries = entries.filter(e => e.exchange !== exchange);
      entries.push(price);
      this.prices.set(normalizedKey, entries);
      this.lastUpdate = Date.now();
      
      this.checkArbitrage(normalizedKey, contract, entries);
      this.monitorOpenTrades(normalizedKey, price);`, `      let entries = this.prices.get(normalizedKey) || [];
      let priceData = entries.find(e => e.exchange === exchange);
      if (!priceData) {
        priceData = { bids: [], asks: [], bidIv: 0, askIv: 0, underlyingPrice: 0, delta: 0, exchange, timestamp: Date.now() };
        entries.push(priceData);
      }
      priceData.bidIv = bidIv;
      priceData.askIv = askIv;
      priceData.underlyingPrice = underlyingPrice;
      priceData.delta = parseFloat(rawData.delta || (rawData.greeks && rawData.greeks.delta) || 0);
      priceData.timestamp = Date.now();
      this.prices.set(normalizedKey, entries);
      this.lastUpdate = Date.now();
      this.monitorOpenTrades(normalizedKey, priceData);`);

const origCheckArb = `    // Use best available ask for spread display (ask always present if there's a market)
    const deribitAsk = deribit.ask || 0;
    const bybitAsk = bybit.ask || 0;
    const deribitBid = deribit.bid || 0;
    const bybitBid = bybit.bid || 0;`;

const newCheckArb = `    const dAsk = deribit.asks.length > 0 ? deribit.asks[0][0] : 0;
    const dBid = deribit.bids.length > 0 ? deribit.bids[0][0] : 0;
    const bAsk = bybit.asks.length > 0 ? bybit.asks[0][0] : 0;
    const bBid = bybit.bids.length > 0 ? bybit.bids[0][0] : 0;
    
    // Scale prices for Deribit
    const deribitAsk = dAsk * deribit.underlyingPrice;
    const deribitBid = dBid * deribit.underlyingPrice;
    const bybitAsk = bAsk;
    const bybitBid = bBid;`;

content = content.replace(origCheckArb, newCheckArb);

const origTrigger = `    // Trigger on price spread > threshold
    if (bestPricePct > this.minProfitThreshold) {
      const tradableSize = useRoute1 ? Math.min(deribit.bidSize, bybit.askSize) : Math.min(bybit.bidSize, deribit.askSize);
      if (tradableSize <= 0) return;

      const opportunity: Opportunity = {
        contract,
        buyExchange:    useRoute1 ? "Bybit"   : "Deribit",
        buyPrice:       useRoute1 ? bybitAsk  : deribitAsk,
        buyUnderlying:  useRoute1 ? bybit.underlyingPrice  : deribit.underlyingPrice,
        buyIv:          useRoute1 ? bybit.askIv : deribit.askIv,
        sellExchange:   useRoute1 ? "Deribit" : "Bybit",
        sellPrice:      useRoute1 ? deribitBid : bybitBid,
        sellUnderlying: useRoute1 ? deribit.underlyingPrice : bybit.underlyingPrice,
        sellIv:         useRoute1 ? deribit.bidIv : bybit.bidIv,
        profitPercent:  bestPricePct,
        ivSpread:       bestIvSpread,
        indexMismatch:  currentMismatch,
        adjustedProfitPercent: bestPricePct,
        tradableSize: Math.min(tradableSize, this.maxPositionSize),
        potentialProfit: (useRoute1 ? (deribitBid - bybitAsk) : (bybitBid - deribitAsk)) * Math.min(tradableSize, this.maxPositionSize)
      };`;

const newTrigger = `    // Deep Book VWAP Calculation
    const buyBook = useRoute1 ? bybit.asks : deribit.asks; // Arrays of [price, size]
    const sellBook = useRoute1 ? deribit.bids : bybit.bids;
    
    if (buyBook.length === 0 || sellBook.length === 0) return;

    let accumulatedSize = 0;
    let accumulatedBuyCost = 0;
    let accumulatedSellValue = 0;
    let buyIdx = 0;
    let sellIdx = 0;
    let layersConsumed = 0;
    const TAKER_FEE = 0.0003; // 0.03%

    while (buyIdx < buyBook.length && sellIdx < sellBook.length && accumulatedSize < this.maxPositionSize) {
      let bPrice = buyBook[buyIdx][0];
      let bSize = buyBook[buyIdx][1];
      let sPrice = sellBook[sellIdx][0];
      let sSize = sellBook[sellIdx][1];

      if (useRoute1) { // Buy Bybit, Sell Deribit
        sPrice = sPrice * deribit.underlyingPrice;
      } else { // Buy Deribit, Sell Bybit
        bPrice = bPrice * deribit.underlyingPrice;
      }

      const layerSpread = sPrice - bPrice;
      const layerFees = (sPrice + bPrice) * TAKER_FEE;
      const layerNetProfit = layerSpread - layerFees;

      if (layerNetProfit <= 0) break; // This layer is not profitable after fees

      const takeSize = Math.min(bSize, sSize, this.maxPositionSize - accumulatedSize);
      accumulatedSize += takeSize;
      accumulatedBuyCost += bPrice * takeSize;
      accumulatedSellValue += sPrice * takeSize;
      layersConsumed = Math.max(buyIdx, sellIdx) + 1;

      if (takeSize === bSize) buyIdx++;
      if (takeSize === sSize) sellIdx++;
    }

    if (accumulatedSize <= 0) return;

    const vwapBuyPrice = accumulatedBuyCost / accumulatedSize;
    const vwapSellPrice = accumulatedSellValue / accumulatedSize;
    const vwapProfitPercent = ((vwapSellPrice - vwapBuyPrice) / vwapBuyPrice) * 100;
    const netAbsoluteProfit = accumulatedSellValue - accumulatedBuyCost - ((accumulatedSellValue + accumulatedBuyCost) * TAKER_FEE);

    if (vwapProfitPercent > this.minProfitThreshold) {
      const opportunity: Opportunity = {
        contract,
        buyExchange:    useRoute1 ? "Bybit"   : "Deribit",
        buyPrice:       vwapBuyPrice,
        buyUnderlying:  useRoute1 ? bybit.underlyingPrice  : deribit.underlyingPrice,
        buyIv:          useRoute1 ? bybit.askIv : deribit.askIv,
        sellExchange:   useRoute1 ? "Deribit" : "Bybit",
        sellPrice:      vwapSellPrice,
        sellUnderlying: useRoute1 ? deribit.underlyingPrice : bybit.underlyingPrice,
        sellIv:         useRoute1 ? deribit.bidIv : bybit.bidIv,
        profitPercent:  vwapProfitPercent,
        ivSpread:       bestIvSpread,
        indexMismatch:  currentMismatch,
        adjustedProfitPercent: vwapProfitPercent,
        tradableSize:   accumulatedSize,
        potentialProfit: netAbsoluteProfit,
        layersConsumed
      };`;

content = content.replace(origTrigger, newTrigger);

fs.writeFileSync(path, content, 'utf8');
console.log('done');
