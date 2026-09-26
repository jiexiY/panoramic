export default function SuitePlan({ alert = false }: { alert?: boolean }) {
  return <svg viewBox="0 0 300 420" className="suite-plan" role="img" aria-label="Suite layout: bedroom at the window, desk and kitchenette to the left, closets and bathroom to the lower right, entry at the bottom.">
    <rect x="20" y="15" width="260" height="385" rx="3" fill="#d7c7b1" stroke="#6c7169" strokeWidth="6" />
    <rect x="55" y="12" width="160" height="8" fill="#d9e8e8" />
    <rect x="154" y="70" width="106" height="135" rx="4" fill="#93816a" />
    <rect x="158" y="74" width="98" height="125" rx="5" fill="#fffdf6" />
    <rect x="158" y="110" width="98" height="89" fill="#b7c5b3" />
    <rect x="165" y="82" width="36" height="24" rx="5" fill="white" />
    <rect x="212" y="82" width="36" height="24" rx="5" fill="white" />
    <rect x="33" y="45" width="38" height="84" rx="2" fill="#977e61" />
    <rect x="73" y="73" width="25" height="35" rx="6" fill="#b8beb0" />
    <rect x="32" y="155" width="31" height="75" fill="#a48c70" />
    <rect x="35" y="165" width="9" height="52" fill="#42575b" />
    <rect x="31" y="250" width="40" height="87" fill="#a99476" />
    <rect x="35" y="259" width="31" height="68" fill="#ece9e0" />
    <circle cx="50" cy="279" r="9" fill="#a7b3af" />
    <rect x="163" y="235" width="104" height="34" fill="#b6a58e" stroke="#777d73" strokeWidth="4" />
    <rect x="163" y="277" width="105" height="113" fill={alert ? "#e6bdab" : "#bac5bf"} />
    <path d="M161 326V275H276 M161 375V397" fill="none" stroke="#777d73" strokeWidth="5" />
    <rect x="172" y="283" width="88" height="35" fill="#eef2eb" stroke="#93a29c" />
    <ellipse cx="245" cy="370" rx="13" ry="18" fill="#fafbf3" />
    <rect x="175" y="359" width="24" height="21" rx="8" fill="#fbfbf5" />
    <rect x="30" y="349" width="56" height="39" fill="#b6a58e" />
    <path d="M98 400H152" stroke="#f8f5ec" strokeWidth="9" />
    <path d="M100 399L100 351M100 351Q150 351 150 398" fill="none" stroke="#8d9387" strokeWidth="1.5" />
    <g fontFamily="Segoe UI, sans-serif" fontSize="11" fill="#354744" textAnchor="middle">
      <text x="140" y="223" fontWeight="700">BEDROOM</text><text x="109" y="294" transform="rotate(-90 109 294)">KITCHENETTE</text>
      <text x="215" y="256">CLOSET</text><text x="215" y="306" fontSize="9">SHOWER</text><text x="217" y="346" fontWeight="700">BATH</text>
      <text x="128" y="417">ENTRY</text>
    </g>
    {alert && <><path d="M129 393L130 346L175 342L215 345" fill="none" stroke="#652b26" strokeWidth="3" strokeDasharray="5 4" /><circle cx="217" cy="345" r="20" fill="#652b26" fillOpacity=".17" /></>}
  </svg>;
}
