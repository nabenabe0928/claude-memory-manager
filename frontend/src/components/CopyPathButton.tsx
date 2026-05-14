import { useState } from "react";
import "./CopyPathButton.css";

interface Props {
  path: string;
}

export function CopyPathButton({ path }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button className="copy-path-btn" onClick={handleCopy} title={`${path} (Copy by Opt+P)`}>
      {copied ? "Copied!" : "Copy path"}
    </button>
  );
}
