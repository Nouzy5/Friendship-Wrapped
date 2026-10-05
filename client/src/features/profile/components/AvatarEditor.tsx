import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Avatar } from "../../../components/ui/Avatar";
import { buttonClasses } from "../../../components/ui/Button";
import { FileButton } from "../../../components/ui/FileButton";
import { getFormError } from "../../../lib/form-errors";
import { IMAGE_ACCEPT, imageFileError } from "../../../lib/image-files";
import type { User } from "../../auth/types";
import { useRemoveAvatar, useUploadAvatar } from "../hooks";

export function AvatarEditor({ user }: { user: User }) {
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();
  const [fileError, setFileError] = useState<string | null>(null);
  const busy = upload.isPending || remove.isPending;
  const error = fileError ?? getFormError(upload.error) ?? getFormError(remove.error);

  function pickFile(file: File) {
    remove.reset();
    const problem = imageFileError(file);
    setFileError(problem);
    if (problem) upload.reset();
    else upload.mutate(file);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Avatar name={user.displayName} seed={user.id} src={user.avatarUrl} size="xl" />
      <div className="flex gap-2">
        <FileButton
          accept={IMAGE_ACCEPT}
          onFile={pickFile}
          disabled={busy}
          className={buttonClasses("secondary", "min-h-9 px-4 text-xs")}
        >
          {upload.isPending ? "Uploading…" : user.avatarUrl ? "Change photo" : "Add photo"}
        </FileButton>
        {user.avatarUrl && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setFileError(null);
              upload.reset();
              remove.mutate();
            }}
            className={buttonClasses("ghost", "min-h-9 px-4 text-xs")}
          >
            {remove.isPending ? "Removing…" : "Remove"}
          </button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
