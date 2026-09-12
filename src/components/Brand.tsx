import logo from "../assets/diffraction-logo.png";

export default function Brand() {
  return (
    <div
      className="aurora-brand flex h-11 items-center gap-2 px-2 mb-2"
      aria-label="Diffraction"
    >
      <img
        src={logo}
        width={26}
        height={26}
        className="size-[26px] shrink-0 object-contain opacity-75"
        alt=""
        aria-hidden="true"
      />
      <span
        className="aurora-wordmark text-base font-semibold tracking-[0.055em]"
        aria-hidden="true"
      >
        Diffraction
      </span>
    </div>
  );
}
