with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'rb') as f:
    content = f.read()

# Exact pattern to find (from byte 32707 to 32870 approximately)
old = b'<SyncContextConsumer\n\t\t\t\t\tchartHandles={chartHandles}\n\t\t\t\t\tsyncContextRef={syncContextRef}\n\t\t\t\t\tcharts={charts}\n\t\t\t\t\tsyncSettings={syncSettings}\n\t\t\t\t\tonRegisterCharts={onSyncContextReady}\n\t\t\t\t\t>\n\t\t\t\t\t<ChartGrid'

new = b'<SyncContextConsumer\n\t\t\t\t\tchartHandles={chartHandles}\n\t\t\t\t\tsyncContextRef={syncContextRef}\n\t\t\t\t\tcharts={charts}\n\t\t\t\t\tsyncSettings={syncSettings}\n\t\t\t\t\tonRegisterCharts={onSyncContextReady}\n\t\t\t\t\tonActiveChartChange={setActiveChartId}\n\t\t\t\t\t>\n\t\t\t\t\t<ChartGrid'

print('Old length:', len(old))
print('New length:', len(new))
print('Old in content:', old in content)

if old in content:
    new_content = content.replace(old, new)
    with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'wb') as f:
        f.write(new_content)
    print('File updated successfully!')
else:
    print('Old text not found!')
    # Find where it differs
    idx = content.find(b'<SyncContextConsumer')
    if idx >= 0:
        print('Found SyncContextConsumer at:', idx)
        print('Actual content:', content[idx:idx+len(old)])
