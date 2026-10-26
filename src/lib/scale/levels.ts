export const defaultFormatters = {
	yearFormat: "%Y",
	quarterFormat: "%b %Y",
	monthFormat: "%b",
	weekFormat: "%d %b",
	dayFormat: "%a %d",
	hourFormat: "%_I %p",
	minuteFormat: "%I:%M %p",
	secondFormat: "%I:%M:%S %p",
	milliSecondFormat: "%L",
};

export const levelDefinition = [
	/* eslint-disable no-unused-vars */
	/* 19 */(d: any, date: any, i: any) => d.startOfYear && date.getFullYear() % 12 === 0 && "yearFormat",
	/* 18 */(d: any, date: any, i: any) => d.startOfYear && date.getFullYear() % 4 === 0 && "yearFormat",
	/* 17 */(d: any, date: any, i: any) => d.startOfYear && date.getFullYear() % 2 === 0 && "yearFormat",
	/* 16 */(d: any, date: any, i: any) => d.startOfYear && "yearFormat",
	/* 15 */(d: any, date: any, i: any) => d.startOfQuarter && "quarterFormat",
	/* 14 */(d: any, date: any, i: any) => d.startOfMonth && "monthFormat",
	/* 13 */(d: any, date: any, i: any) => d.startOfWeek && "weekFormat",
	/* 12 */(d: any, date: any, i: any) => d.startOfDay && i % 2 === 0 && "dayFormat",
	/* 11 */(d: any, date: any, i: any) => d.startOfDay && "dayFormat",
	/* 10 */(d: any, date: any, i: any) => d.startOfHalfDay && "hourFormat", // 12h
	/*  9 */(d: any, date: any, i: any) => d.startOfQuarterDay && "hourFormat", // 6h
	/*  8 */(d: any, date: any, i: any) => d.startOfEighthOfADay && "hourFormat", // 3h
	/*  7 */(d: any, date: any, i: any) => d.startOfHour && date.getHours() % 2 === 0 && "hourFormat", // 2h -- REMOVE THIS
	/*  6 */(d: any, date: any, i: any) => d.startOfHour && "hourFormat", // 1h
	/*  5 */(d: any, date: any, i: any) => d.startOf30Minutes && "minuteFormat",
	/*  4 */(d: any, date: any, i: any) => d.startOf15Minutes && "minuteFormat",
	/*  3 */(d: any, date: any, i: any) => d.startOf5Minutes && "minuteFormat",
	/*  2 */(d: any, date: any, i: any) => d.startOfMinute && "minuteFormat",
	/*  1 */(d: any, date: any, i: any) => d.startOf30Seconds && "secondFormat",
	/*  0 */(d: any, date: any, i: any) => "secondFormat",
	/* eslint-enable no-unused-vars */
];