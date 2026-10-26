import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { widgetMessagesVi } from "../widget/i18n/messages.vi";
import { widgetMessagesEn } from "../widget/i18n/messages.en";
import type { SeriesTypeId } from "../lib/core";

export type DemoLanguage = "vi" | "en";

type TranslationParams = Record<string, string | number | undefined>;
export type DemoTranslate = (key: string, params?: TranslationParams) => string;

type SeriesDisplayParams = Record<string, unknown> | undefined;

const DEMO_LANGUAGE_STORAGE_KEY = "rsc-demo-language-v1";

const translations: Record<DemoLanguage, Record<string, string>> = {
	vi: {
		...widgetMessagesVi,
		"language.label": "Ngôn ngữ",
		"language.vi": "VI",
		"language.en": "EN",
		"common.na": "n/a",
		"common.publish": "Xuất bản",
		"library.runtimeLane.label": "Runtime lane",
		"library.runtimeLane.fork": "Runtime · Fork",
		"library.runtimeLane.auto": "Canary · Auto",
		"library.runtimeLane.autoToFork": "Canary · Auto → Fork",
		"library.runtimeLane.pending": "Canary · Đang xác định runtime",
		"library.runtimeLane.awaitingWidget": "Đang chờ widget xác nhận runtime thực tế",
		"library.runtimeLane.chartCanvasReady": "Chart overlay contract đã sẵn sàng trên runtime hiện tại",
		"library.runtimeLane.drawingOverlayReady": "Drawing overlay contract đã sẵn sàng trên runtime hiện tại",
		"library.runtimeLane.optionAuto": "Embed",
		"library.runtimeLane.optionFork": "Fork",
		"theme.shellMode": "Thay đổi giao diện áp dụng cho toàn bộ shell và canvas biểu đồ. Chế độ hiện tại: {mode}.",
		"theme.mode.light": "sáng",
		"theme.mode.dark": "tối",
		"settings.openDialog": "Mở hộp thoại cài đặt",
		"settings.dialogTitle": "Hộp thoại cài đặt kiểu GoCharting",
		"settings.manageSections": "Các mục cài đặt",
		"settings.priceMarkersKicker": "Nét vẽ",
		"settings.whaleNote": "Hiện thị các lệnh mua/bán lớn trên biểu đồ giá.",
		"settings.cvdNote": "Hiện thị chỉ báo CVD trên biểu đồ.",
		"settings.overLimit": "Số pane đang hiển thị vượt quá giới hạn đã cấu hình. Hãy giảm bớt trước khi thêm pane mới.",
		"settings.pinned": "Đã ghim",
		"settings.locked": "Đã khóa",
		"settings.hidden": "Ẩn",
		"settings.pane": "Khung",
		"settings.paneName": "Tên pane",
		"settings.defaultPane": "Mặc định",
		"settings.customPane": "Tùy chỉnh",
		"settings.lineWidth": "Độ dày đường",
		"settings.fillMode": "Kiểu tô vùng",
		"settings.fillModeNone": "Tắt",
		"settings.fillModeSolid": "Màu đặc",
		"settings.fillModeFade": "Mờ dần",
		"settings.fillOpacity": "Độ đậm vùng tô",
		"settings.fillColor": "Màu vùng tô",
		"settings.subColors": "Màu thành phần",
		"settings.jawPeriod": "Chu kỳ Jaw (Hàm)",
		"settings.teethPeriod": "Chu kỳ Teeth (Răng)",
		"settings.lipsPeriod": "Chu kỳ Lips (Môi)",
		"settings.jawShift": "Độ trễ Jaw (Hàm)",
		"settings.teethShift": "Độ trễ Teeth (Răng)",
		"settings.lipsShift": "Độ trễ Lips (Môi)",
		"settings.anchor": "Neo thời gian (Session/Week/Month)",
		"settings.anchorTime": "Thời điểm neo (Timestamp)",
		"settings.showBands": "Hiển thị dải biên",
		"settings.multiplier": "Hệ số nhân",
		"settings.lookback": "Chu kỳ xem xét (Lookback)",
		"settings.pivotType": "Loại điểm xoay",
		"indicator.ma.description": "Đường trung bình động",
		"indicator.strengthRelative": "Sức mạnh tương đối",
		"indicator.bbi.description": "Chỉ số Bò và Gấu",
		"indicator.sar.description": "Parabolic SAR",
		"indicator.obv.description": "Khối lượng cân bằng",
		"indicator.wr.description": "Williams %R",
		"indicator.vr.description": "Tỷ lệ khối lượng",
		"indicator.kdj.description": "Dao động ngẫu nhiên KDJ",
		"indicator.cci.description": "Chỉ số kênh hàng hóa",
		"indicator.dmi.description": "Chỉ số chuyển động định hướng",
		"indicator.bias.description": "Tỷ lệ lệch",
		"indicator.brar.description": "Tỷ lệ Bò-Gấu",
		"indicator.mtm.description": "Đà tăng/giảm",
		"indicator.emv.description": "Dễ chuyển động",
		"indicator.ao.description": "Bộ dao động tuyệt vời",
		"indicator.roc.description": "Tỷ lệ thay đổi",
		"indicator.trix.description": "MA lũy thừa ba",
		"indicator.dma.description": "MA vi sai",
		"indicator.pvt.description": "Xu hướng Giá-Khối lượng",
		"indicator.psy.description": "Đường tâm lý",
		"indicator.cr.description": "Chỉ số CR",
		"indicator.wma.description": "Weighted Moving Average (WMA)",
		"indicator.vwma.description": "Volume Weighted Moving Average (VWMA)",
		"indicator.hma.description": "Hull Moving Average (HMA)",
		"indicator.dema.description": "Double Exponential Moving Average (DEMA)",
		"indicator.tema.description": "Triple Exponential Moving Average (TEMA)",
		"indicator.maRibbon.description": "Multi-period MA Ribbon",
		"indicator.ichimoku.description": "Ichimoku Cloud",
		"indicator.supertrend.description": "Supertrend",
		"indicator.keltner.description": "Keltner Channels",
		"indicator.donchian.description": "Donchian Channels",
		"indicator.chaikinVol.description": "Chaikin Volatility",
		"indicator.stdDev.description": "Standard Deviation",
		"indicator.hv.description": "Historical Volatility",
		"indicator.ci.description": "Choppiness Index",
		"indicator.cmf.description": "Chaikin Money Flow (CMF)",
		"indicator.mfi.description": "Money Flow Index (MFI)",
		"indicator.volOsc.description": "Volume Oscillator",
		"indicator.vwap.description": "Volume Weighted Average Price (Session VWAP)",
		"indicator.anchoredVwap.description": "Anchored Volume Weighted Average Price",
		"indicator.alligator.description": "William Alligator",
		"indicator.fractals.description": "William Fractals",
		"indicator.gator.description": "Gator Oscillator",
		"indicator.ac.description": "Accelerator Oscillator (AC)",
		"indicator.pivotStandard.description": "Pivot Points Standard",
		"indicator.pivotHighLow.description": "Pivot Points High/Low",
		"indicator.marketProfile.description": "Hồ sơ thị trường Time Price Opportunity",
		"indicator.volumeProfile.description": "Hồ sơ khối lượng giao dịch theo mức giá",
		"indicator.footprint.description": "Biểu đồ cung cầu chi tiết mức giá",
		"indicator.deltaProfile.description": "Hồ sơ Delta tích lũy và tín hiệu phân kỳ",
		"settings.createIndicator": "Tạo một chỉ báo mới",
		"settings.composerNote": "Bộ tạo dùng tham số mặc định từ registry và luôn yêu cầu chọn trục Y trước khi thêm.",
		"settings.paneSummary": "Mỗi thao tác thêm hoặc chỉnh sửa đều phải chọn trục Y rõ ràng.",
		"settings.dataAdapter.vninvest": "VNInvest",
		"library.topbarAria": "BT Charts",
		"library.timeframes": "Khung thời gian",
		"library.managePanes": "Quản lý panes",
		"library.primaryPaneLocked": "Pane chính luôn hiển thị",
		"library.dragPane": "Kéo {pane}",
		"library.dragDisabled": "Pane chính không thể kéo",
		"library.dragTitle": "Kéo để đổi vị trí pane",
		"library.addSeriesToPane": "Thêm series cho {pane}",
		"library.addSeries": "Thêm indicator/series",
		"library.hidePane": "Ẩn pane",
		"library.showPane": "Hiện pane",
		"library.restorePane": "Hiện lại pane",
		"library.hidePaneAria": "Ẩn {pane}",
		"library.showPaneAria": "Hiện {pane}",
		"library.removePaneHint": "Ẩn pane (có thể khôi phục từ menu Panes)",
		"library.showIndicator": "Hiện indicator",
		"library.hideIndicator": "Ẩn indicator",
		"library.showIndicatorAria": "Hiện {series}",
		"library.hideIndicatorAria": "Ẩn {series}",
		"library.removeIndicator": "Xóa indicator khỏi pane này",
		"library.removeIndicatorAria": "Xóa {series}",
		"library.splitterHint": "Kéo để thay đổi chiều cao pane • Nhấp đúp để đặt lại",
		"library.switchToLight": "Chế độ sáng",
		"library.switchToDark": "Chế độ tối",
		"library.switchToLightAria": "Chuyển sang giao diện sáng",
		"library.switchToDarkAria": "Chuyển sang giao diện tối",
		"library.drawingTools": "Công cụ vẽ",
		"library.loadingPriceData": "Đang tải dữ liệu Binance…",
		"library.loadingRealData": "Đang tải dữ liệu thật từ Binance…",
		"library.pairBars": "{count} nến",
		"library.volumeShort": "Vol",
		"library.compare": "So sánh",
		"library.replay": "Phát lại",
		"library.upgrade": "Nâng cấp",
		"drawing.dockObjectsEmpty": "Chưa có nét vẽ nào trong chart hiện tại.",
		"drawing.dockTemplatesEmpty": "Tab mẫu sẽ được hoàn thiện ở slice tiếp theo.",
		"drawing.pointLegendEmpty": "Chọn một nét vẽ có điểm semantic để xem chi tiết.",
		"drawing.pointLegendHint": "Rê chuột lên một điểm để làm nổi bật đúng vị trí trên chart.",
		"paperTrading.hint": "Bấm vào chart khi phát lại đang chạy để mở vị thế ảo. Bấm lại để đóng vị thế.",
		"paperTrading.title": "Paper trading",
		"paperTrading.sizingMode": "Kích thước vị thế",
		"paperTrading.sizingFixed": "Số lượng cố định",
		"paperTrading.sizingPercent": "% vốn",
		"paperTrading.riskPercent": "Rủi ro %",
		"paperTrading.initialEquity": "Vốn ban đầu",
		"paperTrading.report": "Báo cáo replay",
		"paperTrading.total": "Tổng giao dịch",
		"paperTrading.wins": "Thắng",
		"paperTrading.losses": "Thua",
		"paperTrading.winRate": "Tỷ lệ thắng",
		"paperTrading.avgPnl": "PnL trung bình",
		"paperTrading.unrealized": "PnL chưa thực hiện",
		"paperTrading.avgBarsHeld": "Giữ trung bình",
		"paperTrading.bestTrade": "Giao dịch tốt nhất",
		"paperTrading.worstTrade": "Giao dịch tệ nhất",
		"paperTrading.journal": "Nhật ký giao dịch",
		"paperTrading.reset": "Xóa nhật ký",
		"drawing.contextMenuTitle": "Thao tác nét vẽ",
		"drawing.duplicate": "Nhân bản",
		"drawing.bringToFront": "Đưa lên lớp trên cùng",
		"drawing.sendToBack": "Đưa xuống lớp dưới cùng",
		"drawing.bringForward": "Đưa lên trước",
		"drawing.sendBackward": "Đưa xuống sau",
		"drawing.selectGroup": "Chọn cả nhóm",
		"drawing.deleteGroup": "Xóa cả nhóm",
		"chartType.candlestick": "Candlestick",
		"chartType.line": "Line",
		"chartType.area": "Area",
		"tool.cursor": "Cursor",
		"tool.trendLine": "Trend Line",
		"tool.hLine": "Horizontal Line",
		"tool.vLine": "Vertical Line",
		"tool.channel": "Channel",
		"tool.text": "Text Note",
		"tool.rectangle": "Rectangle",
		"tool.arrow": "Arrow",
		"tool.ray": "Ray",
		"tool.extendedLine": "Extended Line",
		"tool.polyline": "Polyline",
		"toolbar.favoriteTools": "Danh sách yêu thích",
		"toolbar.hideFavoritesBar": "Ẩn thanh công cụ yêu thích",
		"toolbar.showFavoritesBar": "Hiện thanh công cụ yêu thích",
		"toolbar.toggleFavoritesBar": "Ẩn/Hiện thanh yêu thích",
		"toolbar.unpinFromFavorites": "Bỏ khỏi danh sách yêu thích",
		"contextRail.label": "Bảng điều khiển",
		"contextRail.expand": "Mở rộng bảng điều khiển",
		"contextRail.collapse": "Thu gọn bảng điều khiển",
		"contextRail.summaryTitle": "Tóm tắt",
		"contextRail.symbol": "Mã chứng khoán",
		"contextRail.totalTools": "Tổng công cụ",
		"contextRail.manageDrawings": "Quản lý nét vẽ",
		"contextRail.shortcuts.title": "Phím tắt",
		"contextRail.shortcuts.content": "Space: Chuyển công cụ | Esc: Hủy | Delete: Xóa",
		"contextRail.accordion.symbol": "Mã & Nguồn",
		"contextRail.accordion.timeframe": "Khung thời gian",
		"contextRail.accordion.chartType": "Loại biểu đồ",
		"contextRail.accordion.drawings": "Nét vẽ",
		"contextRail.accordion.toolGroups": "Nhóm công cụ",
		"tool.dateAndPriceRange": "Date & Price Range",
		"tool.longPosition": "Long Position",
		"tool.shortPosition": "Short Position",
		"tool.fibExtension": "Fib Extension",
		"tool.parallelChannel": "Parallel Channel",
		"tool.abcdPattern": "ABCD Pattern",
		"tool.fibArc": "Fibonacci Arc",
		"tool.fibTimeZone": "Fibonacci Time Zone",
		"tool.regressionChannel": "Regression Channel",
		"tool.elliottImpulse": "Elliott Impulse",
		"tool.elliottCorrection": "Elliott Correction",
		"tool.elliottTriangle": "Elliott Triangle",
		"tool.elliottDoubleCombo": "Elliott Double Combo",
		"tool.elliottTripleCombo": "Elliott Triple Combo",
		"settings.maxVisibleBarsNote": "Giới hạn số nến hiển thị đồng thời khi thu phóng ra ngoài.",
		"settings.showNonTradingDays": "Hiển ngày không giao dịch",
		"settings.showNonTradingDaysNote": "Hiển thị các ngày nghỉ lễ và cuối tuần trên trục X.",
		"settings.datasourceKicker": "Nguồn dữ liệu",
		"dataSource.switchHint": "Nhấp để chuyển nguồn dữ liệu",
		"dataSource.binance.info": "Đang dùng dữ liệu Binance trực tiếp.",
		"dataSource.offline.selectFile": "Chọn file dữ liệu",
		"dataSource.offline.hint": "Định dạng CSV: ngày,mở,cao,thấp,đóng,khối lượng",
		"dataSource.offline.loaded": "Đã tải:",
		"vninvest.connect": "Kết nối VNInvest",
		"vninvest.notConnected": "Chưa kết nối",
		"vninvest.connected": "Đã kết nối",
		"vninvest.reConnect": "Kết nối lại",
		"vninvest.pat": "PAT Token",
		"vninvest.symbol": "Mã chứng khoán",
		"vninvest.symbolSearch": "Tìm mã CK...",
		"vninvest.symbolSearch.exAll": "Tất cả",
		"vninvest.symbolSearch.recent": "Gần đây",
		"vninvest.timeframe": "Khung thời gian",
		"vninvest.days": "Số ngày",
		"vninvest.nonTradingDays": "Ngày không giao dịch",
		"vninvest.nonTradingDays.note": "Nhà đầu tư VNSTOCK chỉ có dữ liệu ngày giao dịch",
		"vninvest.nonTradingDays.show": "Hiển ngày nghỉ",
		"vninvest.nonTradingDays.hide": "Ẩn ngày nghỉ",
		"vninvest.load": "Tải biểu đồ",
		"vninvest.loading": "Đang tải dữ liệu VNInvest…",
		"vninvest.noData": "Không có dữ liệu",
		"vninvest.status.success": "Tải thành công",
		"vninvest.status.error": "Lỗi tải dữ liệu",
		"vninvest.error.noPAT": "Chưa có PAT Token. Vui lòng kết nối VNInvest trước.",
		"vninvest.error.tokenExpired": "PAT Token hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.",
		"vninvest.error.patStorage": "Lỗi lưu PAT Token. Vui lòng thử lại.",
		"vninvest.error.noData": "Không có dữ liệu cho mã này.",
		"vninvest.error.authenticatedNoData": "Đã xác thực VNInvest nhưng backend chưa trả dữ liệu cho mã hoặc khung thời gian này.",
		"vninvest.patModal.title": "Kết nối nguồn dữ liệu",
		"vninvest.patModal.tab.paste": "Dán token",
		"vninvest.patModal.tab.login": "Đăng nhập",
		"vninvest.patModal.input.token": "PAT Token",
		"vninvest.patModal.input.username": "Tên đăng nhập",
		"vninvest.patModal.input.password": "Mật khẩu",
		"vninvest.patModal.input.serverUrl": "Máy chủ API",
		"vninvest.patModal.btn.setServer": "Đặt",
		"vninvest.patModal.btn.save": "Lưu token",
		"vninvest.patModal.btn.clear": "Xóa token",
		"vninvest.patModal.btn.login": "Đăng nhập",
		"vninvest.patModal.status.success": "Kết nối thành công!",
		"vninvest.patModal.status.error": "Kết nối thất bại. Kiểm tra lại thông tin.",
		"vninvest.whale": "Dòng tiền cá voi",
		"vninvest.whale.buy": "Mua ròng",
		"vninvest.whale.sell": "Bán ròng",
		"vninvest.whale.shark": "Cá mập (Shark)",
		"vninvest.whale.whale": "Cá voi (Whale)",
		"vninvest.whale.small": "Cá con (Small)",
		"vninvest.whale.summary": "Tổng kết dòng tiền",
		"vninvest.whale.noData": "Chưa có dữ liệu dòng tiền.",
		"vninvest.whale.unit": "tỷ",
		"advisory.decision.STRONG_BUY": "Mua Mạnh",
		"advisory.decision.BUY": "Mua",
		"advisory.decision.HOLD": "Giữ",
		"advisory.decision.SELL": "Bán",
		"advisory.decision.STRONG_SELL": "Bán Mạnh",
		"advisory.confidence": "Độ tin cậy",
		"advisory.refresh": "Cập nhật",
		"advisory.loading": "Đang phân tích...",
		"advisory.error": "Không thể tải khuyến nghị",
		"advisory.toggle": "Bật/Tắt tư vấn AI",
		"tape.title": "Băng thông lệnh",
		"tape.buy": "Mua",
		"tape.sell": "Bán",
		"tape.whale": "Cá mập",
		"tape.filter": "Lọc ≥ X tỷ",
		"tape.empty": "Chưa có lệnh",
		"tape.toggle": "Băng thông",
		"tape.time": "Giờ",
		"tape.price": "Giá",
		"tape.value": "GT (tỷ)",
		"drawing.coordinatesTitle": "Tọa độ nét vẽ",
		"drawing.priceLabel": "Giá (Price)",
		"drawing.timeLabel": "Thời gian (Time)",
		"drawing.segmentSelectorLabel": "Chọn phân đoạn",
		"drawing.segmentAll": "Tất cả",
		"drawing.searchPlaceholder": "Tìm kiếm công cụ vẽ... (ví dụ: Fibonacci...)",
		"drawing.menuLinesMeasures": "Đường kẻ & Thước đo",
		"drawing.menuPatterns": "Mô hình",
		"drawing.menuSacredGeometry": "Hình học Fibonacci & Gann",
		"drawing.menuShapesText": "Hình khối & Chú thích",
		"drawing.templateSaved": "Đã lưu mẫu thiết kế cho {type}",
		"drawing.template.title": "Cấu hình mẫu",
		"drawing.template.load": "Tải mẫu",
		"drawing.template.save": "Lưu mẫu",
		"drawing.template.delete": "Xóa mẫu",
		"drawing.template.placeholder": "Tên mẫu...",
		"drawing.templates": "Mẫu vẽ",
		"drawing.saveAsTemplate": "Lưu làm mẫu",
		"drawing.applyTemplate": "Áp dụng mẫu",
		"drawing.objectTree": "Cây đối tượng",
		"drawing.search": "Tìm kiếm",
		"drawing.groupByType": "Nhóm theo loại",
		"drawing.groupByGroupId": "Nhóm theo ID nhóm",
		"drawing.groupedBy": "Nhóm theo",
		"drawing.visibility": "Hiển thị",
		"drawing.hiddenGlobally": "Ẩn toàn cục",
		"drawing.visibleOnTimeframes": "Hiện trên timeframe",
		"drawing.visibleOnSymbols": "Hiện trên symbol",
		"drawing.syncTimeframes": "Đồng bộ timeframe",
		"drawing.syncEnabled": "Bật đồng bộ",
		"demo.showcaseSelector": "Chọn chế độ xem",
		"demo.showcase": "Chế độ",
		"demo.syncSettings": "Đồng bộ",
		"demo.syncVisibleRange": "Khung nhìn",
		"demo.syncCrosshair": "Crosshair",
		"demo.syncDrawings": "Nét vẽ",
		"demo.syncSymbolLinks": "Liên kết mã",
		"demo.multiChartsTitle": "Multi-Charts Demo",
		"demo.version": "v1.0.0",
		"demo.featuredPanels": "Tính năng",
		"demo.shortcuts": "Phím tắt",
		"demo.saveWorkspace": "Lưu Workspace",
		"demo.addChart": "Thêm Chart",
		"demo.poweredBy": "Cung cấp bởi",
		"demo.systemMenu": "Menu hệ thống",
		"demo.systemMenu.showcase": "Chọn chế độ xem",
		"demo.systemMenu.sync": "Cài đặt đồng bộ",
		"demo.systemMenu.workspace": "Workspace",
		"demo.systemMenu.shortcuts": "Phím tắt",
		"demo.systemMenu.workspaceName": "Tên Workspace",
		"demo.systemMenu.workspaceNamePlaceholder": "Nhập tên workspace...",
		"demo.systemMenu.save": "Lưu",
		"demo.systemMenu.load": "Mở",
		"demo.systemMenu.delete": "Xóa",
		"demo.systemMenu.import": "Nhập JSON",
		"demo.systemMenu.export": "Xuất JSON",
		"demo.systemMenu.autoSave": "Tự động lưu",
		"demo.systemMenu.shortcutsTitle": "Phím tắt",
		"demo.systemMenu.shortcutSave": "Lưu Workspace",
		"demo.systemMenu.shortcutAdd": "Thêm Chart",
		"demo.systemMenu.viewOnGithub": "Xem trên GitHub",
		"demo.theme": "Giao diện",
		"demo.theme.modern-light": "Hiện đại Sáng",
		"demo.theme.classic-dark": "Cổ điển Tối",
		"demo.theme.trading-night": "Giao dịch Đêm",
		"demo.theme.neutral-pro": "Trung tính Pro",
		"demo.theme.high-contrast": "Tương phản Cao",
		"demo.offlineMode": "Offline CSV (dữ liệu demo)",
		"demo.advisory": "Tư vấn AI",
		"demo.geoBlocked": "GEO-BLOCKED (CSV)",
	},
	en: {
		...widgetMessagesEn,
		"language.label": "Language",
		"language.vi": "VI",
		"language.en": "EN",
		"common.na": "n/a",
		"common.binanceLiveLoading": "Loading live Binance data…",
		"common.chartInitializing": "Initializing chart surface...",
		"common.publish": "Publish",
		"common.source": "Source",
		"common.range": "View",
		"library.runtimeLane.label": "Runtime lane",
		"library.runtimeLane.fork": "Runtime · Fork",
		"library.runtimeLane.auto": "Canary · Auto",
		"library.runtimeLane.autoToFork": "Canary · Auto → Fork",
		"library.runtimeLane.pending": "Canary · Resolving runtime",
		"library.runtimeLane.awaitingWidget": "Waiting for the widget to confirm the active runtime",
		"library.runtimeLane.chartCanvasReady": "Chart overlay contract is ready on the active runtime",
		"library.runtimeLane.drawingOverlayReady": "Drawing overlay contract is ready on the active runtime",
		"library.runtimeLane.optionAuto": "Embed",
		"library.runtimeLane.optionFork": "Fork",
		"theme.shellMode": "Appearance updates the whole shell and chart canvas. Current mode: {mode}.",
		"theme.mode.light": "light",
		"theme.mode.dark": "dark",
		"settings.openDialog": "Open settings dialog",
		"settings.dialogTitle": "GoCharting-style settings dialog",
		"timezone.utc": "Universal Time (UTC)",
		"settings.manageSections": "Settings sections",
		"settings.priceMarkersKicker": "Drawings",
		"settings.overLimit": "The current visible pane count exceeds the configured limit. Reduce it before adding another pane.",
		"settings.pinned": "Pinned",
		"settings.locked": "Locked",
		"settings.hidden": "Hidden",
		"settings.pane": "Pane",
		"settings.paneName": "Pane name",
		"settings.defaultPane": "Default",
		"settings.customPane": "Custom",
		"settings.lineWidth": "Line Width",
		"settings.fillMode": "Fill mode",
		"settings.fillModeNone": "Off",
		"settings.fillModeSolid": "Solid",
		"settings.fillModeFade": "Fade",
		"settings.fillOpacity": "Fill opacity",
		"settings.fillColor": "Fill color",
		"settings.subColors": "Component Colors",
		"settings.sub.bbMiddle": "Middle",
		"settings.stdDev": "Std. deviation",
		"settings.thresholdUsd": "USD threshold",
		"settings.afStep": "AF step",
		"settings.afMax": "AF max",
		"settings.signalPeriod": "Signal period",
		"settings.fastPeriod": "Fast period",
		"settings.slowPeriod": "Slow period",
		"settings.jawPeriod": "Jaw period",
		"settings.teethPeriod": "Teeth period",
		"settings.lipsPeriod": "Lips period",
		"settings.jawShift": "Jaw shift",
		"settings.teethShift": "Teeth shift",
		"settings.lipsShift": "Lips shift",
		"settings.anchor": "Anchor type",
		"settings.anchorTime": "Anchor time",
		"settings.showBands": "Show bands",
		"settings.multiplier": "Multiplier",
		"settings.lookback": "Lookback period",
		"settings.pivotType": "Pivot type",
		"indicator.ma.description": "Moving Average",
		"indicator.whale": "Whale Orders",
		"indicator.cvdApprox": "Cumulative Volume Delta",
		"indicator.cvdRealtime": "Real-time Cumulative Volume Delta",
		"indicator.macd": "Moving Average Convergence Divergence",
		"indicator.strengthElder": "Elder Ray Index",
		"indicator.strengthRelative": "Relative Strength",
		"indicator.bbi": "Bull and Bear Index",
		"indicator.bbi.description": "Bull and Bear Index",
		"indicator.sar.description": "Parabolic SAR",
		"indicator.obv.description": "On Balance Volume",
		"indicator.wr.description": "Williams %R",
		"indicator.vr.description": "Volume Ratio",
		"indicator.kdj": "Stochastic KDJ",
		"indicator.kdj.description": "Stochastic KDJ",
		"indicator.cci.description": "Commodity Channel Index",
		"indicator.dmi.description": "Directional Movement Index",
		"indicator.bias.description": "Bias Ratio",
		"indicator.brar.description": "Bull Bear Ratio",
		"indicator.mtm.description": "Momentum",
		"indicator.emv.description": "Ease of Movement",
		"indicator.ao.description": "Awesome Oscillator",
		"indicator.roc.description": "Rate of Change",
		"indicator.trix": "Triple Exponential Moving Average",
		"indicator.trix.description": "Triple Exponential Moving Average",
		"indicator.dma": "Differential Moving Average",
		"indicator.dma.description": "Differential Moving Average",
		"indicator.pvt.description": "Price Volume Trend",
		"indicator.psy.description": "Psychological Line",
		"indicator.cr.description": "CR Indicator",
		"indicator.wma.description": "Weighted Moving Average",
		"indicator.vwma.description": "Volume Weighted Moving Average",
		"indicator.hma.description": "Hull Moving Average",
		"indicator.dema.description": "Double Exponential Moving Average",
		"indicator.tema.description": "Triple Exponential Moving Average",
		"indicator.maRibbon.description": "Multi-period MA Ribbon",
		"indicator.ichimoku.description": "Ichimoku Cloud",
		"indicator.supertrend.description": "Supertrend",
		"indicator.keltner.description": "Keltner Channels",
		"indicator.donchian.description": "Donchian Channels",
		"indicator.chaikinVol.description": "Chaikin Volatility",
		"indicator.stdDev.description": "Standard Deviation",
		"indicator.hv.description": "Historical Volatility",
		"indicator.ci.description": "Choppiness Index",
		"indicator.cmf.description": "Chaikin Money Flow",
		"indicator.mfi.description": "Money Flow Index",
		"indicator.volOsc.description": "Volume Oscillator",
		"indicator.vwap.description": "Volume Weighted Average Price (Session VWAP)",
		"indicator.anchoredVwap.description": "Anchored Volume Weighted Average Price",
		"indicator.alligator.description": "William Alligator",
		"indicator.fractals.description": "William Fractals",
		"indicator.gator.description": "Gator Oscillator",
		"indicator.ac.description": "Accelerator Oscillator",
		"indicator.pivotStandard.description": "Pivot Points Standard",
		"indicator.pivotHighLow.description": "Pivot Points High/Low",
		"indicator.marketProfile.description": "Time Price Opportunity Market Profile",
		"indicator.volumeProfile.description": "Volume at Price Profile",
		"indicator.footprint.description": "Order Flow Footprint Chart",
		"indicator.deltaProfile.description": "Cumulative Delta Profile and Divergences",
		"settings.createIndicator": "Create a new indicator",
		"settings.composerNote": "The composer uses registry defaults and always requires an explicit Y-axis before adding.",
		"settings.paneSummary": "Every add or edit action must choose a Y axis explicitly.",
		"settings.appearanceShell": "Shell appearance",
		"settings.resetDefaults": "Restore defaults",
		"settings.dataAdapterKicker": "Data Source",
		"settings.dataAdapter": "Data Source",
		"settings.dataAdapter.vnstocks": "VNStocks (not ready)",
		"settings.dataAdapter.vninvest": "VNInvest",
		"settings.indicatorSetsKicker": "Indicator sets",
		"settings.builtinSets": "Built-in templates",
		"settings.builtinSetsTitle": "Read-only templates",
		"settings.mySets": "My sets",
		"settings.saveCurrentSet": "Save current layout",
		"settings.setNamePlaceholder": "Name this indicator set...",
		"settings.setSaved": "Saved \\\"{name}\\\"",
		"settings.setApplied": "Applied \\\"{name}\\\"",
		"settings.setDeleted": "Deleted \\\"{name}\\\"",
		"settings.setImported": "Imported \\\"{name}\\\"",
		"settings.importError": "Invalid file or format not recognized",
		"indicatorSet.emaMulti": "EMA Multi",
		"library.topbarAria": "BT Charts",
		"library.timeframes": "Timeframes",
		"library.backfillingHistory": "Backfilling history…",
		"library.managePanes": "Manage panes",
		"library.primaryPaneLocked": "The primary pane is always visible",
		"library.dragPane": "Drag {pane}",
		"library.dragDisabled": "The primary pane cannot be dragged",
		"library.dragTitle": "Drag to reorder pane",
		"library.addSeriesToPane": "Add series to {pane}",
		"library.addSeries": "Add indicator/series",
		"library.hidePane": "Hide pane",
		"library.showPane": "Show pane",
		"library.restorePane": "Show pane again",
		"library.hidePaneAria": "Hide {pane}",
		"library.showPaneAria": "Show {pane}",
		"library.removePaneHint": "Hide pane (can be restored from the Panes menu)",
		"library.showIndicator": "Show indicator",
		"library.hideIndicator": "Hide indicator",
		"library.showIndicatorAria": "Show {series}",
		"library.hideIndicatorAria": "Hide {series}",
		"library.removeIndicator": "Remove indicator from this pane",
		"library.removeIndicatorAria": "Remove {series}",
		"library.splitterHint": "Drag to resize pane • Double-click to reset",
		"library.switchToLight": "Light mode",
		"library.switchToDark": "Dark mode",
		"library.switchToLightAria": "Switch to light mode",
		"library.switchToDarkAria": "Switch to dark mode",
		"library.drawingTools": "Drawing tools",
		"library.loadingPriceData": "Loading Binance data…",
		"library.loadingRealData": "Loading live Binance data…",
		"library.pairBars": "{count} bars",
		"library.volumeShort": "Vol",
		"library.compare": "Compare",
		"library.replay": "Replay",
		"library.upgrade": "Upgrade",
		"replay.controls": "Replay controls",
		"replay.jumpLatest": "Go live",
		"replay.speed": "Replay speed",
		"drawing.toggleList": "Drawings list",
		"drawing.dockTitle": "Drawing dock",
		"drawing.dockPropertiesEmpty": "Select a drawing to edit its properties.",
		"drawing.dockObjectsEmpty": "There are no drawings in the current chart.",
		"drawing.dockTemplatesEmpty": "Templates will be completed in the next slice.",
		"drawing.pointLegendTitle": "Semantic points",
		"drawing.pointLegendEmpty": "Select a drawing with semantic points to see the list.",
		"drawing.pointLegendHint": "Hover a point to highlight the exact anchor on the chart.",
		"paperTrading.title": "Paper trading",
		"paperTrading.hint": "Click the chart while replay is running to open a virtual position. Click again to close it.",
		"paperTrading.report": "Replay report",
		"paperTrading.total": "Total trades",
		"paperTrading.wins": "Winning trades",
		"paperTrading.losses": "Losing trades",
		"paperTrading.winRate": "Win rate",
		"paperTrading.avgPnl": "Average PnL",
		"paperTrading.unrealized": "Unrealized PnL",
		"paperTrading.avgBarsHeld": "Average hold",
		"paperTrading.bestTrade": "Best trade",
		"paperTrading.worstTrade": "Worst trade",
		"paperTrading.journal": "Trade journal",
		"paperTrading.reset": "Clear journal",
		"paperTrading.sizingMode": "Position Sizing",
		"paperTrading.sizingFixed": "Fixed qty",
		"paperTrading.sizingPercent": "% equity",
		"paperTrading.riskPercent": "Risk %",
		"paperTrading.initialEquity": "Initial equity",
		"drawing.inspectorTitle": "Drawing inspector",
		"drawing.textEditorTitle": "Edit text",
		"drawing.textEditorPlaceholder": "Enter text",
		"drawing.textEditorEmpty": "No text yet",
		"drawing.contextMenuTitle": "Drawing actions",
		"drawing.strokeWidth": "Stroke width",
		"drawing.lineStyle": "Line style",
		"drawing.duplicate": "Duplicate",
		"drawing.bringToFront": "Move to top layer",
		"drawing.sendToBack": "Move to bottom layer",
		"drawing.bringForward": "Bring forward",
		"drawing.sendBackward": "Send backward",
		"drawing.drawingsList": "Drawing list",
		"drawing.unlocked": "Unlock",
		"drawing.alert.enabled": "Enable",
		"alert.crossAbove": "Crossed Above",
		"alert.crossBelow": "Crossed Below",
		"drawing.elliott.impulse": "Elliott Impulse Wave",
		"drawing.elliott.doubleCombo": "Elliott Double Combination",
		"drawing.elliott.tripleCombo": "Elliott Triple Combination",
		"drawing.pattern.headAndShoulders": "Head \\u0026 Shoulders",
		"drawing.pattern.threeDrives": "Three Drives Pattern",
		"drawing.fib.channel": "Fib Channel",
		"drawing.fib.speedResistanceFan": "Fib Speed Resistance Fan",
		"drawing.fib.trendBasedFibTime": "Trend-Based Fib Time",
		"drawing.fib.speedResistanceArcs": "Fib Speed Resistance Arcs",
		"drawing.clearAll": "Clear all",
		"drawing.magnetSensitivity": "Magnet Sensitivity",
		"drawing.lineType.trendLine": "Segment",
		"drawing.lineType.ray": "Ray",
		"drawing.inspector.rrTitle": "Position",
		"drawing.templates": "Drawing Templates",
		"drawing.saveAsTemplate": "Save as Template",
		"drawing.applyTemplate": "Apply Template",
		"drawing.objectTree": "Object Tree",
		"drawing.search": "Search",
		"drawing.groupByType": "Group by Type",
		"drawing.groupByGroupId": "Group by Group ID",
		"drawing.visibility": "Visibility",
		"drawing.hiddenGlobally": "Hidden Globally",
		"drawing.visibleOnTimeframes": "Visible on Timeframes",
		"drawing.visibleOnSymbols": "Visible on Symbols",
		"drawing.syncTimeframes": "Sync Timeframes",
		"drawing.syncEnabled": "Enable Sync",
		"toolbar.candleType": "Candle type",
		"toolbar.favorite": "Add to Favorites",
		"toolbar.unfavorite": "Remove from Favorites",
		"toolbar.moreTools": "Favorite tools",
		"toolbar.favoriteTools": "Favorites list",
		"toolbar.hideFavoritesBar": "Hide favorites bar",
		"toolbar.showFavoritesBar": "Show favorites bar",
		"toolbar.toggleFavoritesBar": "Toggle favorites toolbar",
		"toolbar.unpinFromFavorites": "Remove from favorites",
		"contextRail.label": "Control Panel",
		"contextRail.expand": "Expand control panel",
		"contextRail.collapse": "Collapse control panel",
		"contextRail.summaryTitle": "Summary",
		"contextRail.symbol": "Symbol",
		"contextRail.totalTools": "Total Tools",
		"contextRail.manageDrawings": "Manage Drawings",
		"contextRail.shortcuts.title": "Shortcuts",
		"contextRail.shortcuts.content": "Space: Switch tool | Esc: Cancel | Delete: Remove",
		"contextRail.accordion.symbol": "Symbol & Source",
		"contextRail.accordion.timeframe": "Timeframe",
		"contextRail.accordion.chartType": "Chart Type",
		"contextRail.accordion.drawings": "Drawings",
		"contextRail.accordion.toolGroups": "Tool Groups",
		"tool.threeDrivesPattern": "Three Drives Pattern",
		"tool.fibChannel": "Fibonacci Channel",
		"tool.fibSpeedResistanceFan": "Fib Speed Resistance Fan",
		"tool.trendBasedFibTime": "Trend-Based Fib Time",
		"tool.fibCircles": "Fibonacci Circles",
		"tool.fibSpiral": "Fibonacci Spiral",
		"tool.fibSpeedResistanceArcs": "Fib Speed Resistance Arcs",
		"tool.fibWedge": "Fibonacci Wedge",
		"tool.gannSquareFixed": "Fixed Gann Square",
		"tool.group.elliott": "Elliott",
		"settings.maxVisibleBarsNote": "Limits the number of bars displayed when zooming out.",
		"settings.showNonTradingDaysNote": "Show weekend and holiday gaps on the X axis.",
		"settings.datasourceKicker": "Data source",
		"settings.datasourceTitle": "Data source configuration",
		"profile.login": "Log in",
		"profile.logout": "Log out",
		"dataSource.switchHint": "Click to switch data source",
		"dataSource.binance.info": "Using live Binance data.",
		"dataSource.offline.selectFile": "Select data file",
		"dataSource.offline.hint": "CSV format: date,open,high,low,close,volume",
		"dataSource.offline.loaded": "Loaded:",
		"vninvest.connect": "Connect VNInvest",
		"vninvest.notConnected": "Not connected",
		"vninvest.connected": "Connected",
		"vninvest.reConnect": "Reconnect",
		"vninvest.pat": "PAT Token",
		"vninvest.symbol": "Symbol",
		"vninvest.symbolSearch": "Search symbol...",
		"vninvest.symbolSearch.exAll": "All",
		"vninvest.symbolSearch.recent": "Recent",
		"vninvest.timeframe": "Timeframe",
		"vninvest.days": "Days",
		"vninvest.nonTradingDays": "Non-trading days",
		"vninvest.nonTradingDays.note": "VNInvest only provides data for trading days",
		"vninvest.nonTradingDays.show": "Show holidays",
		"vninvest.nonTradingDays.hide": "Hide holidays",
		"vninvest.load": "Load chart",
		"vninvest.loading": "Loading VNInvest data…",
		"vninvest.noData": "No data",
		"vninvest.status.success": "Load successful",
		"vninvest.status.error": "Data load error",
		"vninvest.error.noPAT": "No PAT Token. Please connect to VNInvest first.",
		"vninvest.error.tokenExpired": "PAT Token expired or invalid. Please log in again.",
		"vninvest.error.patStorage": "Error saving PAT Token. Please try again.",
		"vninvest.error.noData": "No data for this symbol.",
		"vninvest.error.authenticatedNoData": "VNInvest authentication succeeded, but the backend returned no data for this symbol or timeframe.",
		"vninvest.patModal.title": "Data source connection",
		"vninvest.patModal.tab.paste": "Paste token",
		"vninvest.patModal.tab.login": "Log in",
		"vninvest.patModal.input.token": "PAT Token",
		"vninvest.patModal.input.username": "Username",
		"vninvest.patModal.input.password": "Password",
		"vninvest.patModal.input.serverUrl": "API Server",
		"vninvest.patModal.btn.setServer": "Set",
		"vninvest.patModal.btn.save": "Save token",
		"vninvest.patModal.btn.clear": "Clear token",
		"vninvest.patModal.btn.login": "Log in",
		"vninvest.patModal.status.success": "Connected successfully!",
		"vninvest.patModal.status.error": "Connection failed. Check your credentials.",
		"vninvest.whale": "Whale money flow",
		"vninvest.whale.buy": "Net buy",
		"vninvest.whale.sell": "Net sell",
		"vninvest.whale.shark": "Shark",
		"vninvest.whale.whale": "Whale",
		"vninvest.whale.small": "Small",
		"vninvest.whale.summary": "Money flow summary",
		"vninvest.whale.noData": "No money flow data.",
		"vninvest.whale.unit": "bn",
		"advisory.decision.STRONG_BUY": "Strong Buy",
		"advisory.decision.BUY": "Buy",
		"advisory.decision.HOLD": "Hold",
		"advisory.decision.SELL": "Sell",
		"advisory.decision.STRONG_SELL": "Strong Sell",
		"advisory.refresh": "Refresh",
		"advisory.loading": "Analyzing...",
		"advisory.error": "Cannot load advisory",
		"advisory.toggle": "Toggle AI Advisory",
		"tape.buy": "Buy",
		"tape.sell": "Sell",
		"tape.whale": "Whale",
		"tape.filter": "Filter ≥ X bn",
		"tape.empty": "No trades yet",
		"tape.toggle": "Tape",
		"tape.time": "Time",
		"tape.price": "Price",
		"tape.value": "Value (bn)",
		"drawing.coordinatesTitle": "Drawing Coordinates",
		"drawing.segmentSelectorLabel": "Select segment",
		"drawing.segmentAll": "All",
		"drawing.searchPlaceholder": "Search drawing tools... (e.g. Fibonacci...)",
		"drawing.menuLinesMeasures": "Lines & Measures",
		"drawing.menuPatterns": "Patterns",
		"drawing.menuSacredGeometry": "Sacred Geometry",
		"drawing.menuShapesText": "Shapes & Text",
		"drawing.templateSaved": "Saved design template for {type}",
		"drawing.template.title": "Template Config",
		"drawing.template.load": "Load Template",
		"drawing.template.save": "Save Template",
		"drawing.template.delete": "Delete Template",
		"drawing.template.placeholder": "Template name...",
		"demo.showcaseSelector": "Select Showcase",
		"demo.showcase": "Showcase",
		"demo.syncSettings": "Sync Settings",
		"demo.syncVisibleRange": "Visible Range",
		"demo.syncCrosshair": "Crosshair",
		"demo.syncDrawings": "Drawings",
		"demo.syncSymbolLinks": "Symbol Links",
		"demo.multiChartsTitle": "Multi-Charts Demo",
		"demo.version": "v1.0.0",
		"demo.featuredPanels": "Panels",
		"demo.shortcuts": "Shortcuts",
		"demo.saveWorkspace": "Save Workspace",
		"demo.addChart": "Add Chart",
		"demo.poweredBy": "Powered by",
		"demo.systemMenu": "System Menu",
		"demo.systemMenu.showcase": "Select Showcase",
		"demo.systemMenu.sync": "Sync Settings",
		"demo.systemMenu.workspace": "Workspace",
		"demo.systemMenu.shortcuts": "Keyboard Shortcuts",
		"demo.systemMenu.workspaceName": "Workspace Name",
		"demo.systemMenu.workspaceNamePlaceholder": "Enter workspace name...",
		"demo.systemMenu.save": "Save",
		"demo.systemMenu.load": "Load",
		"demo.systemMenu.delete": "Delete",
		"demo.systemMenu.import": "Import JSON",
		"demo.systemMenu.export": "Export JSON",
		"demo.systemMenu.autoSave": "Auto-save",
		"demo.systemMenu.shortcutsTitle": "Keyboard Shortcuts",
		"demo.systemMenu.shortcutSave": "Save Workspace",
		"demo.systemMenu.shortcutAdd": "Add Chart",
		"demo.systemMenu.viewOnGithub": "View on GitHub",
		"demo.theme": "Theme",
		"demo.theme.modern-light": "Modern Light",
		"demo.theme.classic-dark": "Classic Dark",
		"demo.theme.trading-night": "Trading Night",
		"demo.theme.neutral-pro": "Neutral Pro",
		"demo.theme.high-contrast": "High Contrast",
		"demo.offlineMode": "Offline CSV (demo data)",
		"demo.advisory": "AI Advisory",
		"demo.geoBlocked": "GEO-BLOCKED (CSV)",
	},
};

const paneLabelKeys: Record<string, string> = {
	price: "library.pricePaneLabel",
	volume: "library.volumePaneLabel",
	momentum: "library.momentumPaneLabel",
	orderflow: "library.orderflowPaneLabel",
	strength: "library.strengthPaneLabel",
};

const seriesLabelKeys: Record<SeriesTypeId, string> = {
	Candlestick: "indicator.candlestick",
	HollowCandle: "indicator.hollowCandle",
	OHLC: "indicator.ohlc",
	HeikinAshi: "indicator.heikinAshi",
	Line: "indicator.line",
	Area: "indicator.area",
	Bar: "indicator.bar",
	// A3 Baseline + A11 Renko/Kagi/PointAndFigure/LineBreak — chart type giá loại,
	// có producer + render mode riêng. Cùng nhóm cổng pro với
	// `chart_baseline`/`chart_exotic`.
	Baseline: "chartType.baseline",
	Renko: "chartType.renko",
	Kagi: "chartType.kagi",
	PointAndFigure: "chartType.pointAndFigure",
	LineBreak: "chartType.lineBreak",
	EMA: "indicator.ema",
	BollingerBand: "indicator.bollingerBand",
	// Legacy plural alias — same label as the canonical type.
	BollingerBands: "indicator.bollingerBand",
	Volume: "indicator.volume",
	"Histogram": "indicator.histogram",
	Whale: "indicator.whale",
	CVDApprox: "indicator.cvdApprox",
	CVDRealtime: "indicator.cvdRealtime",
	RSI: "indicator.rsi",
	MACD: "indicator.macd",
	StrengthElder: "indicator.strengthElder",
	StrengthRelative: "indicator.strengthRelative",
	MA: "indicator.ma",
	BBI: "indicator.bbi",
	SAR: "indicator.sar",
	OBV: "indicator.obv",
	WR: "indicator.wr",
	VR: "indicator.vr",
	KDJ: "indicator.kdj",
	CCI: "indicator.cci",
	DMI: "indicator.dmi",
	BIAS: "indicator.bias",
	BRAR: "indicator.brar",
	MTM: "indicator.mtm",
	EMV: "indicator.emv",
	AO: "indicator.ao",
	ROC: "indicator.roc",
	TRIX: "indicator.trix",
	DMA: "indicator.dma",
	PVT: "indicator.pvt",
	PSY: "indicator.psy",
	CR: "indicator.cr",
	WMA: "indicator.wma",
	VWMA: "indicator.vwma",
	HMA: "indicator.hma",
	DEMA: "indicator.dema",
	TEMA: "indicator.tema",
	MARibbon: "indicator.maRibbon",
	Ichimoku: "indicator.ichimoku",
	Supertrend: "indicator.supertrend",
	Keltner: "indicator.keltner",
	Donchian: "indicator.donchian",
	ChaikinVol: "indicator.chaikinVol",
	StdDev: "indicator.stdDev",
	HV: "indicator.hv",
	CI: "indicator.ci",
	CMF: "indicator.cmf",
	ChaikinOscillator: "indicator.chaikinOscillator",
	MFI: "indicator.mfi",
	VolOsc: "indicator.volOsc",
	VWAP: "indicator.vwap",
	AnchoredVWAP: "indicator.anchoredVwap",
	Alligator: "indicator.alligator",
	Fractals: "indicator.fractals",
	Gator: "indicator.gator",
	AC: "indicator.ac",
	PivotStandard: "indicator.pivotStandard",
	PivotHighLow: "indicator.pivotHighLow",
	MarketProfile: "indicator.marketProfile",
	VolumeProfile: "indicator.volumeProfile",
	Footprint: "indicator.footprint",
	DeltaProfile: "indicator.deltaProfile",
	SMFI: "indicator.smfi",
	WyckoffWave: "indicator.wyckoffWave",
};

function numberParam(params: SeriesDisplayParams, key: string, fallback: number): number {
	const value = params?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatSeriesSuffix(type: SeriesTypeId, params?: SeriesDisplayParams): string {
	switch (type) {
		case "EMA":
			return `(${numberParam(params, "period", 20)})`;
		case "RSI":
			return `(${numberParam(params, "period", 14)})`;
		case "BollingerBand":
		case "BollingerBands":
			return `(${numberParam(params, "period", 20)},${numberParam(params, "stdDev", 2)})`;
		case "MACD":
			return `(${numberParam(params, "fast", 12)},${numberParam(params, "slow", 26)},${numberParam(params, "signal", 9)})`;
		case "KDJ":
			return `(${numberParam(params, "period", 9)},${numberParam(params, "m1", 3)},${numberParam(params, "m2", 3)})`;
		case "CCI":
			return `(${numberParam(params, "period", 20)})`;
		case "DMI":
			return `(${numberParam(params, "period", 14)})`;
		case "BIAS":
			return `(${numberParam(params, "period", 6)})`;
		case "BRAR":
			return `(${numberParam(params, "period", 26)})`;
		case "MTM":
			return `(${numberParam(params, "period", 6)})`;
		case "EMV":
			return `(${numberParam(params, "period", 14)})`;
		case "ROC":
			return `(${numberParam(params, "period", 12)})`;
		case "TRIX":
			return `(${numberParam(params, "period", 12)})`;
		case "DMA":
			return `(${numberParam(params, "fastPeriod", 10)},${numberParam(params, "slowPeriod", 50)})`;
		case "PSY":
			return `(${numberParam(params, "period", 12)})`;
		case "CR":
			return `(${numberParam(params, "period", 26)})`;
		case "Whale":
			return `(${numberParam(params, "threshold", 50_000)})`;
		case "WMA":
		case "VWMA":
		case "HMA":
		case "DEMA":
		case "TEMA":
		case "Donchian":
		case "ChaikinVol":
		case "StdDev":
		case "HV":
		case "CI":
			return `(${numberParam(params, "period", type === "WMA" || type === "HMA" || type === "DEMA" || type === "TEMA" ? 9 : type === "CI" ? 14 : type === "ChaikinVol" ? 10 : 20)})`;
		case "MARibbon": {
			const typeStr = params?.type || "EMA";
			const periods = (params?.periods as number[]) || [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
			return `(${typeStr},${periods.join(",")})`;
		}
		case "Ichimoku":
			return `(${numberParam(params, "tenkan", 9)},${numberParam(params, "kijun", 26)},${numberParam(params, "senkouB", 52)})`;
		case "Supertrend":
			return `(${numberParam(params, "period", 10)},${numberParam(params, "multiplier", 3)})`;
		case "Keltner":
			return `(${numberParam(params, "period", 20)},${numberParam(params, "atrPeriod", 10)},${numberParam(params, "multiplier", 2)})`;
		case "CMF":
			return `(${numberParam(params, "period", 20)})`;
		case "MFI":
			return `(${numberParam(params, "period", 14)})`;
		case "VolOsc":
			return `(${numberParam(params, "shortPeriod", 5)},${numberParam(params, "longPeriod", 20)})`;
		case "VWAP": {
			const anchor = params?.anchor || "session";
			return `(${anchor})`;
		}
		case "AnchoredVWAP": {
			const anchorTime = numberParam(params, "anchorTime", 0);
			return `(${anchorTime})`;
		}
		case "Alligator":
			return `(${numberParam(params, "jawPeriod", 13)},${numberParam(params, "teethPeriod", 8)},${numberParam(params, "lipsPeriod", 5)})`;
		case "Fractals":
			return "";
		case "Gator":
			return `(${numberParam(params, "jawPeriod", 13)},${numberParam(params, "teethPeriod", 8)},${numberParam(params, "lipsPeriod", 5)})`;
		case "AC":
			return "";
		case "PivotStandard": {
			const pTypes = ["Standard", "Fibonacci", "Camarilla", "Woodie", "DeMark"];
			const pType = pTypes[numberParam(params, "pivotType", 0)] || "Standard";
			return `(${pType})`;
		}
		case "PivotHighLow": {
			const pTypes = ["Standard", "Fibonacci"];
			const pType = pTypes[numberParam(params, "pivotType", 0)] || "Standard";
			const lookback = numberParam(params, "lookback", 10);
			return `(${lookback},${pType})`;
		}
		case "MarketProfile":
			return `(${numberParam(params, "tpoPeriodMinutes", 30)}m)`;
		case "VolumeProfile":
			return "";
		case "Footprint":
			return `(${numberParam(params, "barIntervalMs", 60000) / 1000}s)`;
		case "DeltaProfile":
			return `(${numberParam(params, "smaPeriod", 14)})`;
		default:
			return "";
	}
}

const SERIES_ABBREVIATIONS: Record<SeriesTypeId, string> = {
	EMA: "EMA",
	BollingerBand: "BB",
	BollingerBands: "BB",
	RSI: "RSI",
	MACD: "MACD",
	CVDApprox: "CVD Approx",
	CVDRealtime: "CVD Realtime",
	StrengthElder: "Elder Strength",
	StrengthRelative: "RS",
	Whale: "Whale Flow",
	MA: "MA",
	BBI: "BBI",
	SAR: "SAR",
	OBV: "OBV",
	WR: "WR",
	VR: "VR",
	KDJ: "KDJ",
	CCI: "CCI",
	DMI: "DMI",
	BIAS: "BIAS",
	BRAR: "BRAR",
	MTM: "MTM",
	EMV: "EMV",
	AO: "AO",
	ROC: "ROC",
	TRIX: "TRIX",
	DMA: "DMA",
	PVT: "PVT",
	PSY: "PSY",
	CR: "CR",
	Candlestick: "Candlestick",
	HollowCandle: "Hollow Candle",
	OHLC: "OHLC",
	HeikinAshi: "HA",
	Line: "Line",
	Area: "Area",
	Baseline: "Baseline",
	Renko: "Renko",
	Kagi: "Kagi",
	PointAndFigure: "Point & Figure",
	LineBreak: "Line Break",
	Volume: "Volume",
	"Histogram": "Histogram",
	WMA: "WMA",
	VWMA: "VWMA",
	HMA: "HMA",
	DEMA: "DEMA",
	TEMA: "TEMA",
	MARibbon: "Ribbon",
	Ichimoku: "Ichimoku",
	Supertrend: "Supertrend",
	Keltner: "Keltner",
	Donchian: "Donchian",
	ChaikinVol: "ChaikinVol",
	StdDev: "StdDev",
	HV: "HV",
	CI: "CI",
	CMF: "CMF",
	ChaikinOscillator: "Chaikin Oscillator",
	MFI: "MFI",
	VolOsc: "VolOsc",
	VWAP: "VWAP",
	AnchoredVWAP: "AVWAP",
	Alligator: "Alligator",
	Fractals: "Fractals",
	Gator: "Gator",
	AC: "AC",
	PivotStandard: "PP Std",
	PivotHighLow: "PP HL",
	MarketProfile: "TPO",
	VolumeProfile: "VP",
	Footprint: "Footprint",
	DeltaProfile: "DeltaProf",
	SMFI: "SMFI",
	WyckoffWave: "Wyckoff",
};

export function formatSeriesDisplayName(type: SeriesTypeId, params?: SeriesDisplayParams, t?: DemoTranslate, index?: number): string {
	const baseLabel = t ? (t(seriesLabelKeys[type]) || type) : type;
	const suffix = formatSeriesSuffix(type, params);
	let withSuffix = suffix ? `${baseLabel} ${suffix}` : baseLabel;
	if (!params) {
		const abbreviation = SERIES_ABBREVIATIONS[type];
		if (abbreviation && baseLabel !== abbreviation) {
			withSuffix = `${baseLabel} (${abbreviation})`;
		}
	}
	return typeof index === "number" ? `${withSuffix} #${index + 1}` : withSuffix;
}

interface DemoI18nContextValue {
	language: DemoLanguage;
	setLanguage: (language: DemoLanguage) => void;
	t: DemoTranslate;
	getPaneLabel: (paneId: string, fallback?: string) => string;
	hasProvider: boolean;
}

function readStoredLanguage(): DemoLanguage {
	if (typeof window === "undefined") {
		return "vi";
	}
	try {
		const stored = window.localStorage.getItem(DEMO_LANGUAGE_STORAGE_KEY);
		if (stored === "vi" || stored === "en") {
			return stored;
		}
	} catch {
		// ignore storage errors
	}
	return document.documentElement.lang.toLowerCase().startsWith("en") ? "en" : "vi";
}

function interpolate(message: string, params?: TranslationParams): string {
	if (!params) {
		return message;
	}
	return message.replace(/\{(\w+)\}/g, (_match, key: string) => {
		const value = params[key];
		return value === undefined ? `{${key}}` : String(value);
	});
}

function translate(language: DemoLanguage, key: string, params?: TranslationParams): string {
	const template = translations[language][key] ?? translations.vi[key] ?? key;
	return interpolate(template, params);
}

const defaultContextValue: DemoI18nContextValue = {
	language: "vi",
	setLanguage: () => {},
	t: (key, params) => translate("vi", key, params),
	getPaneLabel: (paneId, fallback) => translate("vi", paneLabelKeys[paneId] ?? "library.genericPaneLabel", paneLabelKeys[paneId] ? undefined : { index: fallback ?? paneId }),
	hasProvider: false,
};

const DemoI18nContext = createContext<DemoI18nContextValue>(defaultContextValue);

export function DemoI18nProvider({ children }: { children: ReactNode }) {
	const [language, setLanguageState] = useState<DemoLanguage>(readStoredLanguage);

	useEffect(() => {
		document.documentElement.lang = language;
		try {
			window.localStorage.setItem(DEMO_LANGUAGE_STORAGE_KEY, language);
		} catch {
			// ignore storage errors
		}
	}, [language]);

	const setLanguage = useCallback((nextLanguage: DemoLanguage) => {
		setLanguageState(nextLanguage);
	}, []);

	const t = useCallback<DemoTranslate>((key, params) => translate(language, key, params), [language]);

	const getPaneLabel = useCallback((paneId: string, fallback?: string) => {
		const key = paneLabelKeys[paneId];
		if (key) {
			return t(key);
		}
		return fallback ?? t("library.genericPaneLabel", { index: paneId });
	}, [t]);

	const value = useMemo(() => ({ language, setLanguage, t, getPaneLabel, hasProvider: true }), [getPaneLabel, language, setLanguage, t]);

	return <DemoI18nContext.Provider value={value}>{children}</DemoI18nContext.Provider>;
}

export function useDemoI18n() {
	return useContext(DemoI18nContext);
}

export function DemoI18nBoundary({ children }: { children: ReactNode }) {
	const context = useContext(DemoI18nContext);
	if (context.hasProvider) {
		return <>{children}</>;
	}
	return <DemoI18nProvider>{children}</DemoI18nProvider>;
}


