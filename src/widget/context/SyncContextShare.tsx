import React, { createContext, useContext, useMemo } from "react";

interface SyncContextShareValue {
  syncContext: ReturnType<typeof import("@vninvestcharts/engine-react").useSyncContext> | null;
}

const SyncContextShareContext = createContext<SyncContextShareValue>({ syncContext: null });

export const SyncContextShareProvider: React.FC<{ children: React.ReactNode; syncContext: SyncContextShareValue["syncContext"] }> = ({
	children,
	syncContext
}) => {
	const value = useMemo(() => ({ syncContext }), [syncContext]);
	return (
		<SyncContextShareContext.Provider value={value}>
			{children}
		</SyncContextShareContext.Provider>
	);
};

export const useSyncContextShare = () => useContext(SyncContextShareContext);

export default SyncContextShareContext;