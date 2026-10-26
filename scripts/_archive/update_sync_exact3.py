with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'rb') as f:
    content = f.read()

# The exact pattern from the usage (210 bytes)
old = b'<SyncContextConsumer\n\t\t\t\t\tchartHandles={chartHandles}\n\t\t\t\t\tsyncContextRef={syncContextRef}\n\t\t\t\t\tcharts={charts}\n\t\t\t\t\tsyncSettings={syncSettings}\n\t\t\t\t\tonRegisterCharts={onSyncContextReady}\n\t\t\t\t\t>\n\t\t\t\t\t<ChartGrid'

# The new pattern with onActiveChartChange added
new = b'<SyncContextConsumer\n\t\t\t\t\tchartHandles={chartHandles}\n\t\t\t\t\tsyncContextRef={syncContextRef}\n\t\t\t\t\tcharts={charts}\n\t\t\t\t\tsyncSettings={syncSettings}\n\t\t\t\t\tonRegisterCharts={onSyncContextReady}\n\t\t\t\t\tonActiveChartChange={setActiveChartId}\n\t\t\t\t\t>\n\t\t\t\t\t<ChartGrid'

print('Old in content:', old in content)
print('Old length:', len(old))
print('New length:', len(new))

if old in content:
    new_content = content.replace(old, new)
    with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'wb') as f:
        f.write(new_content)
    print('File updated successfully!')
else:
    print('Old text not found!')
    # Find the difference
    idx = content.find(b'<SyncContextConsumer\n\t\t\t\t\tchartHandles={chartHandles}')
    if idx >= 0:
        print('Found at:', idx)
        actual = content[idx:idx+210]
        print('Actual:', actual)
        print('Expected:', old)
        print('Match:', actual == old)
