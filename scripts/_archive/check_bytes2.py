with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'rb') as f:
    content = f.read()

idx = content.find(b'onOpenSettings={() => {')
if idx >= 0:
    # Print the exact bytes from there to the Chart Grid comment
    end_idx = content.find(b'Chart Grid with SyncContext', idx)
    if end_idx >= 0:
        print('Exact bytes:')
        print(content[idx:end_idx+50])
