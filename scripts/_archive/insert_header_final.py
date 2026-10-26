with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'r') as f:
    content = f.read()

# The exact marker to find
marker = '\t\t\t\t)}\n\n\t\t\t\t{/* Chart Grid with SyncContext */}'

replacement = '''\t\t\t\t)}

\t\t\t\t{/* Unified Header */}
\t\t\t\t<UnifiedHeader
\t\t\t\t\tactiveChartId={activeChartId}
\t\t\t\t\tactiveChartSymbol={activeChartSymbol}
\t\t\t\t\tactiveChartTimeframe={activeChartTimeframe}
\t\t\t\t\tactiveChartType={activeChartType}
\t\t\t\t\tsymbols={allSymbols}
\t\t\t\t\ttimeframes={allTimeframes}
\t\t\t\t\tchartTypes={allChartTypes}
\t\t\t\t\tsyncSettings={syncSettings}
\t\t\t\t\tonSymbolChange={(symbol) => {
\t\t\t\t\t\tconst handle = chartHandles.current.get(activeChartId ?? "");
\t\t\t\t\t\thandle?.setSymbol?.(symbol);
\t\t\t\t\t}}
\t\t\t\t\tonTimeframeChange={(timeframe) => {
\t\t\t\t\t\tconst handle = chartHandles.current.get(activeChartId ?? "");
\t\t\t\t\t\thandle?.setTimeframe?.(timeframe as any);
\t\t\t\t\t}}
\t\t\t\t\tonChartTypeChange={(chartType) => {
\t\t\t\t\t\tconst handle = chartHandles.current.get(activeChartId ?? "");
\t\t\t\t\t\thandle?.setChartType?.(chartType as any);
\t\t\t\t\t}}
\t\t\t\t\tonSyncToggle={(type) => {
\t\t\t\t\t\tsetSyncSettings(prev => ({ ...prev, [type]: !prev[type] }));
\t\t\t\t\t}}
\t\t\t\t\tonSystemMenuOpen={() => setShowSystemMenu(true)}
\t\t\t\t/>

\t\t\t\t{/* Chart Grid with SyncContext */}'''

if marker in content:
    new_content = content.replace(marker, replacement)
    with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'w') as f:
        f.write(new_content)
    print('File updated successfully!')
else:
    print('Marker not found!')
    # Debug: show what we're looking for
    idx = content.find('Chart Grid with SyncContext')
    before = content[:idx]
    last_brace = before.rfind('})}')
    print('Context around last })}:', repr(content[last_brace:idx+50]))
