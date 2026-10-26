import React, { Component } from "react";
import PropTypes from "prop-types";

import GenericChartComponent from "../GenericChartComponent";

class SVGComponent extends Component<any, any> {
	render() {
		const { children } = this.props;
		return <GenericChartComponent
			drawOn={[]}
			svgDraw={children}
		/>;
	}
}

// NOTE: React 19 no longer runs propTypes validation at runtime.
// PropTypes kept for documentation and IDE tooling only.
SVGComponent.propTypes = {
	children: PropTypes.func.isRequired,
};

export default SVGComponent;
