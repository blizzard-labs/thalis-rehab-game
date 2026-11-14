import seal from "./seal.webp";

export function Brand({ home = false }: { home?: boolean }) {
  const Title = home ? "h1" : "span";
  return (
    <div className="nr-brand">
      <img className="nr-brand-seal" src={seal} width={76} height={76} alt="" />
      <Title className="nr-brand-name">NeuroReach</Title>
      <a
        className="nr-credit"
        href="https://krishna-bhatt.com/"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span>Powered by</span>{" "}<strong>THALis</strong>
        <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}
