import { forwardRef } from 'react';
import { Slot } from 'radix-ui';
import { cn } from '../../utils/ui/index.js';
import { buttonVariants } from './button.data.js';
import type { ButtonProps } from './button.props.js';

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => {
    const { className, variant, size, asChild = false, ...rest } = props;

    const Comp = asChild ? Slot.Slot : 'button';

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...rest}
      />
    );
  },
);
Button.displayName = 'Button';
