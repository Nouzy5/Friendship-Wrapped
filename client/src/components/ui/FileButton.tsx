import { useRef, type ComponentPropsWithoutRef } from "react";

type FileButtonProps = Omit<ComponentPropsWithoutRef<"button">, "onClick" | "type"> & {
  accept: string;
  /** On phones, opens the camera app directly instead of the file picker. */
  capture?: "user" | "environment";
  onFile: (file: File) => void;
};

/** A button that opens the system file picker (or camera) and hands back the chosen file. */
export function FileButton({ accept, capture, onFile, children, ...buttonProps }: FileButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button type="button" onClick={() => inputRef.current?.click()} {...buttonProps}>
        {children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={capture}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = ""; // so choosing the same file again still fires onChange
          if (file) onFile(file);
        }}
      />
    </>
  );
}
