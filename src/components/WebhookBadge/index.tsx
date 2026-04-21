import { memo } from "preact/compat";
import { Badge } from "../Badge";
import { Webhook } from "lucide-react";
interface WebhookBadgeProps {
  name: string;
}

function WebhookBadgeInner({ name }: WebhookBadgeProps) {
  return (
    <Badge variant="webhook" title={`Posted by webhook: ${name}`}>
      <Webhook />
      WEBHOOK
    </Badge>
  );
}

export const WebhookBadge = memo(WebhookBadgeInner);
