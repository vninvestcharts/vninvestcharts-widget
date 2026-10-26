with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'r') as f:
    content = f.read()

# Find SystemMenu usage
import re
for m in re.finditer(r'<SystemMenu', content):
    idx = m.start()
    print(f'Found at {idx}:')
    print(content[idx:idx+500])
    print('---')
