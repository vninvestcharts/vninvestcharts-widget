with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'rb') as f:
    content = f.read()

# Search from the known usage position (32707)
usage_idx = 32707
print('Content at usage_idx:', content[usage_idx:usage_idx+250])

# The exact pattern from the usage
old = content[usage_idx:usage_idx+210]
print('Old pattern:', old)

new = old.replace(
    b'onRegisterCharts={onSyncContextReady}\n\t\t\t\t\t>\n\t\t\t\t\t<ChartGrid',
    b'onRegisterCharts={onSyncContextReady}\n\t\t\t\t\tonActiveChartChange={setActiveChartId}\n\t\t\t\t\t>\n\t\t\t\t\t<ChartGrid'
)

print('New pattern:', new)

if old in content:
    new_content = content.replace(old, new)
    with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'wb') as f:
        f.write(new_content)
    print('File updated successfully!')
else:
    print('Old text not found in full content!')
