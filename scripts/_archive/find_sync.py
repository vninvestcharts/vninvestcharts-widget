with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'r') as f:
    content = f.read()

idx = content.find('SyncContextConsumer')
if idx >= 0:
    print('Found at:', idx)
    print('Context:', repr(content[idx:idx+300]))
else:
    print('Not found')
