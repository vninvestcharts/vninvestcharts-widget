with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'r') as f:
    content = f.read()

# Find the start and end of ChartGrid component
start_marker = '// ============================================\n// ChartGrid - Consumes syncContext via useSyncContextShare\n// ============================================\n\ninterface ChartGridProps {'
end_marker = 'return <>{renderSplitter}</>;\n};\n\n// ============================================\n// Component\n// ============================================'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx >= 0 and end_idx >= 0:
    # Include the end marker in the removal
    end_idx += len(end_marker)
    
    new_content = content[:start_idx] + content[end_idx:]
    
    with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'w') as f:
        f.write(new_content)
    print('ChartGrid component removed successfully!')
else:
    print('Markers not found!')
    print('Start found:', start_idx >= 0)
    print('End found:', end_idx >= 0)
