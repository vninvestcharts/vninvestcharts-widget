with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'rb') as f:
    content = f.read()

idx = content.find(b'onOpenSettings={() => {')
if idx >= 0:
    print('Found at:', idx)
    print('Context:', content[idx:idx+200])
