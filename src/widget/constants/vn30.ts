/**
 * VN30 basket — single source of truth (moved from VNSymbolSearch).
 * Consumed by symbol search sections and the Phase 4b watchlist fallback.
 */
export const VN30_SYMBOLS: string[] = [
	"VIC", "VHM", "VCB", "BID", "GAS", "VNM", "CTG", "MBB", "TCB", "HPG",
	"ACB", "VPB", "STB", "MSN", "PLX", "GVR", "HDB", "SSB", "MWG", "REE",
	"POW", "VJC", "PNJ", "VIB", "SAB", "FPT", "BVH", "TPB", "SHB", "BCM",
];

/** Static display names for the VN30 basket (watchlist fallback rows). */
export const VN30_NAMES: Record<string, string> = {
	VIC: "Vingroup",
	VHM: "Vinhomes",
	VCB: "Vietcombank",
	BID: "BIDV",
	GAS: "PV Gas",
	VNM: "Vinamilk",
	CTG: "VietinBank",
	MBB: "MB",
	TCB: "Techcombank",
	HPG: "Hòa Phát",
	ACB: "ACB",
	VPB: "VPBank",
	STB: "Sacombank",
	MSN: "Masan",
	PLX: "Petrolimex",
	GVR: "GVR",
	HDB: "HDBank",
	SSB: "SeABank",
	MWG: "MWG",
	REE: "REE",
	POW: "PV Power",
	VJC: "VietJet",
	PNJ: "PNJ",
	VIB: "VIB",
	SAB: "Sabeco",
	FPT: "FPT",
	BVH: "Bảo Việt",
	TPB: "TPBank",
	SHB: "SHB",
	BCM: "Becamex",
};
