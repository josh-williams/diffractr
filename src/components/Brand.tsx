import logo from "../assets/diffractr-logo.svg";

export default function Brand() {
  return (
    <div
      className="aurora-brand flex items-center gap-2 px-2"
      aria-label="diffractr"
    >
      <img
        src={logo}
        width={32}
        height={32}
        className="size-8 shrink-0 object-contain"
        alt=""
        aria-hidden="true"
      />
      <span
        className="aurora-wordmark text-base font-semibold tracking-[0.055em]"
        aria-hidden="true"
      >
        diffractr
      </span>
    </div>
  );
}
