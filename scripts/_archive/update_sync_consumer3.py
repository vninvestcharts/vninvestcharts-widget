with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'r') as f:
    content = f.read()

# Use actual tab characters
old = '<SyncContextConsumer\n\t\t\t\t\tchartHandles={chartHandles}\n\t\t\t\t\tsyncContextRef={syncContextRef}\n\t\t\t\t\tcharts={charts}\n\t\t\t\t\tsyncSettings={syncSettings}\n\t\t\t\t\tonRegisterCharts={onSyncContextReady}\n\t\t\t\t\t>'

new = '<SyncContextConsumer\n\t\t\t\t\tchartHandles={chartHandles}\n\t\t\t\t\tsyncContextRef={syncContextRef}\n\t\t\t\t\tcharts={charts}\n\t\t\t\t\tsyncSettings={syncSettings}\n\t\t\t\t\tonRegisterCharts={onSyncContextReady}\n\t\t\t\t\tonActiveChartChange={setActiveChartId}\n\t\t\t\t\t>'

if old in content:
    new_content = content.replace(old, new)
    with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'w') as f:
        f.write(new_content)
    print('File updated successfully!')
else:
    print('Old text not found!')
