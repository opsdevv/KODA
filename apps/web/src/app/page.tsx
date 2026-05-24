"use client";

import { IdeLayout } from "@/components/ide/ide-layout";
import { WorkspaceBootstrap } from "@/components/ide/workspace-bootstrap";

export default function HomePage() {
  return (
    <WorkspaceBootstrap>
      <IdeLayout />
    </WorkspaceBootstrap>
  );
}
