with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'r') as f:
    content = f.read()

old = '''<SyncContextConsumer
			chartHandles={chartHandles}
			syncContextRef={syncContextRef}
			charts={charts}
			syncSettings={syncSettings}
			onRegisterCharts={onSyncContextReady}
		>'''

new = '''<SyncContextConsumer
			chartHandles={chartHandles}
			syncContextRef={syncContextRef}
			charts={charts}
			syncSettings={syncSettings}
			onRegisterCharts={onSyncContextReady}
			onActiveChartChange={setActiveChartId}
		>'''

if old in content:
    new_content = content.replace(old, new)
    with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'w') as f:
        f.write(new_content)
    print('File updated successfully!')
else:
    print('Old text not found!')
    # Debug
    idx = content.find('onRegisterCharts={onSyncContextReady}')
    if idx >= 0:
        print('Found onRegisterCharts at:', idx)
        print('Context:', repr(content[idx-100:idx+100]))
