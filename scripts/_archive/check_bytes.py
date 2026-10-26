with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'rb') as f:
    content = f.read()

idx = content.find(b'onRegisterCharts={onSyncContextReady}')
if idx >= 0:
    print('Found at byte:', idx)
    print('Context:', content[idx-200:idx+100])
