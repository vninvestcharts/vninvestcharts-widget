with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'r') as f:
    content = f.read()

idx = content.find('Chart Grid with SyncContext')
if idx >= 0:
    print('Found at:', idx)
    print('Context:', repr(content[idx-100:idx+50]))
