with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'rb') as f:
    content = f.read()

old = b'<ChartGrid\n\t\t\t\t\t\tcharts={charts}\n\t\t\t\t\t\tlayout={layout}\n\t\t\t\t\t\tactiveChartId={activeChartId}\n\t\t\t\t\t\tsyncSettings={syncSettings}\n\t\t\t\t\t\tdefaultChartProps={mergedChartProps}\n\t\t\t\t\t\tresizeAdapter={resizeAdapter}\n\t\t\t\t\t\tkeyboardAdapter={keyboardAdapter}\n\t\t\t\t\t\tclockAdapter={clockAdapter}\n\t\t\t\t\t\tstorageAdapter={storageAdapter}\n\t\t\t\t\t\tportalAdapter={portalAdapter}\n\t\t\t\t\t\tregistryAdapter={registryAdapter}\n\t\t\t\t\t\tchartRefs={chartRefs}\n\t\t\t\t\t\tchartHandles={chartHandles}\n\t\t\t\t\t\tsetActiveChart={setActiveChart}\n\t\t\t\t\t\taddChart={addChart}\n\t\t\t\t\t\tstyles={styles}\n\t\t\t\t\t/>'

new = b'<GridContainer\n\t\t\t\t\t\tcharts={charts}\n\t\t\t\t\t\tlayout={layout}\n\t\t\t\t\t\tactiveChartId={activeChartId}\n\t\t\t\t\t\tsyncSettings={syncSettings}\n\t\t\t\t\t\tdefaultChartProps={mergedChartProps}\n\t\t\t\t\t\tresizeAdapter={resizeAdapter}\n\t\t\t\t\t\tkeyboardAdapter={keyboardAdapter}\n\t\t\t\t\t\tclockAdapter={clockAdapter}\n\t\t\t\t\t\tstorageAdapter={storageAdapter}\n\t\t\t\t\t\tportalAdapter={portalAdapter}\n\t\t\t\t\t\tregistryAdapter={registryAdapter}\n\t\t\t\t\t\tchartRefs={chartRefs}\n\t\t\t\t\t\tchartHandles={chartHandles}\n\t\t\t\t\t\tsetActiveChart={setActiveChart}\n\t\t\t\t\t\taddChart={addChart}\n\t\t\t\t\t\tstyles={styles}\n\t\t\t\t\t/>'

print('Old in content:', old in content)

if old in content:
    new_content = content.replace(old, new)
    with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'wb') as f:
        f.write(new_content)
    print('File updated successfully!')
else:
    print('Old text not found!')
    idx = content.find(b'<ChartGrid')
    if idx >= 0:
        print('Found ChartGrid at:', idx)
        print('Context:', content[idx:idx+500])
