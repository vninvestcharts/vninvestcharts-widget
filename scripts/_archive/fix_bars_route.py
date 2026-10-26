#!/usr/bin/env python3
"""Fix bars API route: rate limit, parallel Binance proxy, mock fallback."""
import re

path = "/home/pham/vninvest-site/src/app/api/bars/[symbol]/route.ts"
with open(path, "r") as f:
    content = f.read()

# 1. Increase rate limit
content = content.replace("const RATE_LIMIT = 60;", "const RATE_LIMIT = 120;")

# 2. Replace sequential Binance loop with Promise.any + timeout
old_binance_loop = """    for (const domain of BINANCE_DOMAINS) {
      try {
        const url = `${domain}/api/v3/klines?${queryParams.toString()}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`Binance error: ${res.statusText}`);
        }
        const rawData = await res.json() as Array<[number, string, string, string, string, string, number, string, number, string, string, string]>;
        const mappedBars = rawData.map((item, index) => {
          const open = parseFloat(item[1]);
          const high = parseFloat(item[2]);
          const low = parseFloat(item[3]);
          const close = parseFloat(item[4]);
          const volume = parseFloat(item[5]);
          const buyVolume = parseFloat(item[9]);
          const sellVolume = volume - buyVolume;
          return {
            date: new Date(item[0]).toISOString(),
            open,
            high,
            low,
            close,
            volume,
            buyVolume,
            sellVolume,
            foreignBuy: 0,
            foreignSell: 0,
            index,
            dataIndex: index
          };
        });

        return NextResponse.json(mappedBars, {
          headers: {
            'Cache-Control': 'public, max-age=15'
          }
        });
      } catch (err) {
        lastError = err;
      }
    }"""

new_binance_fast = """    const fetchWithTimeout = (domain: string) => {
      const url = `${domain}/api/v3/klines?${queryParams.toString()}`;
      return fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
        .then(res => {
          if (!res.ok) throw new Error(`Binance error: ${res.statusText}`);
          return res.json() as Promise<Array<[number, string, string, string, string, string, number, string, number, string, string, string]>>;
        })
        .then(rawData => rawData.map((item, index) => {
          const open = parseFloat(item[1]);
          const high = parseFloat(item[2]);
          const low = parseFloat(item[3]);
          const close = parseFloat(item[4]);
          const volume = parseFloat(item[5]);
          const buyVolume = parseFloat(item[9]);
          const sellVolume = volume - buyVolume;
          return {
            date: new Date(item[0]).toISOString(),
            open,
            high,
            low,
            close,
            volume,
            buyVolume,
            sellVolume,
            foreignBuy: 0,
            foreignSell: 0,
            index,
            dataIndex: index
          };
        }));
    };

    try {
      const mappedBars = await Promise.any(BINANCE_DOMAINS.map(fetchWithTimeout));
      return NextResponse.json(mappedBars, {
        headers: { 'Cache-Control': 'public, max-age=15' }
      });
    } catch (err) {
      lastError = err;
    }"""

content = content.replace(old_binance_loop, new_binance_fast)

# 3. Replace 502 fallback with mock bars
old_502 = """    return NextResponse.json({ error: lastError?.message || 'failed to fetch from Binance' }, { status: 502 });"""
new_mock_fallback = """    // Fallback to generated mock bars when all Binance domains fail
    const mockBars = generateMockBars(requestSymbol, timeframe, fromDate, toDate, limitNumber);
    return NextResponse.json(mockBars, {
      headers: { 'Cache-Control': 'public, max-age=300' }
    });"""

content = content.replace(old_502, new_mock_fallback)

with open(path, "w") as f:
    f.write(content)

print("bars route patched successfully")
