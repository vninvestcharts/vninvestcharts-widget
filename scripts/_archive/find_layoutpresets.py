with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'r') as f:
    content = f.read()

idx = content.find('layoutPresets={[]}')
if idx >= 0:
    print('Found at:', idx)
    print('Context:', content[idx-100:idx+100])
