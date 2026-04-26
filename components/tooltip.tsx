import React, { FC, ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
	children?: ReactNode;
	orientation: "right" | "top" | "bottom" | "left";
	tooltipText?: string;
};

const Tooltip: FC<Props> = ({ children, orientation, tooltipText }: Props) => {
	const anchorRef = useRef<HTMLDivElement>(null);
	const [visible, setVisible] = useState(false);
	const [position, setPosition] = useState({ top: 0, left: 0 });

	const updatePosition = () => {
		const rect = anchorRef.current?.getBoundingClientRect();
		if (!rect) return;
		switch (orientation) {
			case "top":
				setPosition({ top: rect.top - 8, left: rect.left + rect.width / 2 });
				break;
			case "bottom":
				setPosition({ top: rect.bottom + 8, left: rect.left + rect.width / 2 });
				break;
			case "right":
				setPosition({ top: rect.top + rect.height / 2, left: rect.right + 8 });
				break;
			case "left":
				setPosition({ top: rect.top + rect.height / 2, left: rect.left - 8 });
				break;
		}
	};

	useEffect(() => {
		if (!visible) return;
		updatePosition();
		window.addEventListener("scroll", updatePosition, true);
		window.addEventListener("resize", updatePosition);
		return () => {
			window.removeEventListener("scroll", updatePosition, true);
			window.removeEventListener("resize", updatePosition);
		};
	}, [visible]);

	const portalTarget = typeof document !== "undefined" ? document.body : null;

	const getTooltipStyle = (): React.CSSProperties => {
		switch (orientation) {
			case "top":
				return { top: position.top, left: position.left, transform: "translate(-50%, -100%)" };
			case "bottom":
				return { top: position.top, left: position.left, transform: "translate(-50%, 0)" };
			case "right":
				return { top: position.top, left: position.left, transform: "translate(0, -50%)" };
			case "left":
				return { top: position.top, left: position.left, transform: "translate(-100%, -50%)" };
		}
	};

	const arrowClasses: Record<string, string> = {
		top: "absolute left-1/2 -translate-x-1/2 top-full -translate-y-1/2 rotate-45",
		bottom: "absolute left-1/2 -translate-x-1/2 bottom-full translate-y-1/2 rotate-45",
		right: "absolute right-full top-1/2 -translate-y-1/2 translate-x-1/2 rotate-45",
		left: "absolute left-full top-1/2 -translate-y-1/2 -translate-x-1/2 rotate-45",
	};

	return (
		<div
			ref={anchorRef}
			className="relative flex items-center"
			onMouseEnter={() => { updatePosition(); setVisible(true); }}
			onMouseLeave={() => setVisible(false)}
		>
			{children}
			{visible && portalTarget && createPortal(
				<div
					className="fixed z-[9999] pointer-events-none"
					style={getTooltipStyle()}
					role="tooltip"
				>
					<div className="relative px-3 py-1.5 bg-[color:rgb(var(--group-theme))] text-white text-sm rounded-lg whitespace-nowrap shadow-lg">
						<div className={`${arrowClasses[orientation]} w-2.5 h-2.5 bg-[color:rgb(var(--group-theme))]`} />
						{tooltipText}
					</div>
				</div>,
				portalTarget
			)}
		</div>
	);
};

export default Tooltip;
