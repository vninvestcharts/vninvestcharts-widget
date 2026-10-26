import { min } from "d3-array";

import identity from "./identity";

export default function zipper() {
	let combine: any = identity;

	function zip(this: any) {
		const n = arguments.length;
		if (!n) return [];
		const m = (min(arguments as any, d3_zipLength) ?? 0) as number;

		// eslint-disable-next-line prefer-const
		let i, zips: any[] = new Array(m);
		for (i = -1; ++i < m; ) {
			for (let j = -1, zipItem = zips[i] = new Array(n); ++j < n; ) {
				zipItem[j] = arguments[j][i];
			}
			zips[i] = combine.apply(this, zips[i]);
		}
		return zips;
	}
	function d3_zipLength(d: any) {
		return d.length;
	}
	zip.combine = function(x: any) {
		if (!arguments.length) {
			return combine;
		}
		combine = x;
		return zip;
	};
	return zip;
}