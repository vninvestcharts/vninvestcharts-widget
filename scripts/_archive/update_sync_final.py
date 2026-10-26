with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'rb') as f:
    content = f.read()

old = b'<SyncContextConsumer\n\t\t\t\t\tchartHandles={chartHandles}\n\t\t\t\t\tsyncContextRef={syncContextRef}\n\t\t\t\t\tcharts={charts}\n\t\t\t\t\tsyncSettings={syncSettings}\n\t\t\t\t\tonRegisterCharts={onSyncContextReady}\n\t\t\t\t\t>\n\t\t\t\t\t<ChartGrid'

new = b'<SyncContextConsumer\n\t\t\t\t\tchartHandles={chartHandles}\n\t\t\t\t\tsyncContextRef={syncContextRef}\n\t\t\t\t\tcharts={charts}\n\t\t\t\t\tsyncSettings={syncSettings}\n\t\t\t\t\tonRegisterCharts={onSyncContextReady}\n\t\t\t\t\tonActiveChartChange={setActiveChartId}\n\t\t\t\t\t>\n\t\t\t\t\t<ChartGrid'

if old in content:
    new_content = content.replace(old, new)
    with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'wb') as f:
        f.write(new_content)
    print('File updated successfully!')
else:
    print('Old text not found!')
