import React from "react";

import shallowEqual from "./shallowEqual";

class PureComponent extends React.Component<any, any> {
	shouldComponentUpdate(nextProps: any, nextState: any, nextContext: any) {
		return !shallowEqual(this.props, nextProps)
			|| !shallowEqual(this.state, nextState)
			|| !shallowEqual(this.context, nextContext);
	}
}

export default PureComponent;