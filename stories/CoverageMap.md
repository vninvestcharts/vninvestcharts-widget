# Coverage Map

P6 uses the examples catalog in `vninvestcharts-examples/README.md` as the source inventory. The first story batch covers the most representative flows and keeps the rest of the catalog open for later expansion.

| Source example | Story file | Coverage |
| --- | --- | --- |
| `CandleStickStockScaleChartWithVolumeBarV3` | `stories/CandleStickStockScaleChartWithVolumeBarV3.stories.tsx` | Candlestick + volume bars + moving averages |
| `CandleStickChartWithMACDIndicator` | `stories/CandleStickChartWithMACDIndicator.stories.tsx` | MACD pane + histogram + tooltip |
| `CandleStickChartWithBrush` | `stories/CandleStickChartWithBrush.stories.tsx` | Brush-driven window selection |
| `CandleStickChartWithAnnotation` | `stories/CandleStickChartWithAnnotation.stories.tsx` | Static label annotation on the price pane |
| `CandleStickChartWithHoverTooltip` | `stories/CandleStickChartWithHoverTooltip.stories.tsx` | OHLC hover tooltip + moving averages |
| `CandleStickChartPanToLoadMore` | `stories/CandleStickChartPanToLoadMore.stories.tsx` | Load-more control that extends the visible history |
| `CandleStickChartWithRSIIndicator` | `stories/CandleStickChartWithRSIIndicator.stories.tsx` | Bollinger overlay + RSI pane |
| `VolumeProfileChart` | `stories/VolumeProfileChart.stories.tsx` | Volume profile overlay on the price chart |