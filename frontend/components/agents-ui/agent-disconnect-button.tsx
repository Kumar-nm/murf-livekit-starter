'use client';

import { type ComponentProps } from 'react';
import { type VariantProps } from 'class-variance-authority';
import { PhoneOffIcon } from 'lucide-react';
import { useSessionContext } from '@livekit/components-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/shadcn/utils';

export interface AgentDisconnectButtonProps
  extends ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  /**
   * Custom icon to display.
   * Defaults to PhoneOffIcon.
   */
  icon?: React.ReactNode;

  /**
   * The size of the button.
   * @default 'default'
   */
  size?: 'default' | 'sm' | 'lg' | 'icon';

  /**
   * The variant of the button.
   * @default 'destructive'
   */
  variant?:
    | 'default'
    | 'outline'
    | 'destructive'
    | 'ghost'
    | 'link';

  /**
   * The children to render.
   */
  children?: React.ReactNode;

  /**
   * The callback for when the button is clicked.
   */
  onClick?: (
    event: React.MouseEvent
  ) => void;
}

/**
 * A button to disconnect from the current agent session.
 *
 * If an onClick callback is provided, that callback
 * controls what happens.
 *
 * Otherwise, the button disconnects the session
 * directly.
 */
export function AgentDisconnectButton({
  icon,
  size = 'default',
  variant = 'destructive',
  children,
  onClick,
  ...props
}: AgentDisconnectButtonProps) {

  const { end } =
    useSessionContext();

  const handleClick = (
    event: React.MouseEvent
  ) => {

    // If the parent supplied an onClick,
    // let the parent control the action.
    if (onClick) {
      onClick(event);
      return;
    }

    // Otherwise, preserve the original
    // default behavior of disconnecting.
    if (typeof end === 'function') {
      end();
    }
  };

  return (
    <Button
      size={size}
      variant={variant}
      onClick={handleClick}
      {...props}
    >
      {icon ?? <PhoneOffIcon />}

      {children ?? (
        <span
          className={cn(
            size?.includes('icon') &&
              'sr-only'
          )}
        >
          END CALL
        </span>
      )}
    </Button>
  );
}