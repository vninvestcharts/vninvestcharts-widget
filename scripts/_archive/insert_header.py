with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'r') as f:
    content = f.read()

# Find the Chart Grid comment
idx = content.find('Chart Grid with SyncContext')
print('Found:', idx >= 0)
if idx >= 0:
    print('Index:', idx)
    print('Context:', repr(content[idx-80:idx+60]))

    # Find the preceding pattern
    before = content[:idx]
    last_brace = before.rfind('})}')
    print('Last })} at:', last_brace)
    print('Context around })}:', repr(content[last_brace-20:last_brace+10]))
