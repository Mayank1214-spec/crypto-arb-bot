const WebSocket = require('ws');

async function checkPrices() {
    const symbolDeribit = "BTC-26MAR27-68000-C"; // Example
    const symbolBybit = "BTC-26MAR27-68000-C-USDT";

    console.log("Checking Deribit...");
    const wsD = new WebSocket("wss://www.deribit.com/ws/api/v2");
    wsD.on('open', () => {
        wsD.send(JSON.stringify({
            jsonrpc: "2.0",
            method: "public/ticker",
            params: { instrument_name: symbolDeribit },
            id: 1
        }));
    });
    wsD.on('message', (data) => {
        const res = JSON.parse(data);
        if (res.result) {
            console.log("Deribit Result:", JSON.stringify(res.result, null, 2));
            wsD.close();
        }
    });

    console.log("Checking Bybit...");
    const wsB = new WebSocket("wss://stream.bybit.com/v5/public/option");
    wsB.on('open', () => {
        wsB.send(JSON.stringify({
            op: "subscribe",
            args: [`tickers.${symbolBybit}`]
        }));
    });
    wsB.on('message', (data) => {
        const res = JSON.parse(data);
        if (res.topic === `tickers.${symbolBybit}`) {
            console.log("Bybit Result:", JSON.stringify(res.data, null, 2));
            wsB.close();
        }
    });
}

checkPrices();
