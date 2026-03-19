import { forwardRef } from 'react';
import { Link as RouterLink, NavLink as RouterNavLink } from 'react-router-dom';

const DEFAULT_DISCOVER = 'render';
const DEFAULT_PREFETCH = 'none';

export const Link = forwardRef(function AppLink(
  {
    discover = DEFAULT_DISCOVER,
    prefetch = DEFAULT_PREFETCH,
    viewTransition = true,
    ...props
  },
  ref
) {
  return (
    <RouterLink
      ref={ref}
      discover={discover}
      prefetch={prefetch}
      viewTransition={viewTransition}
      {...props}
    />
  );
});

export const NavLink = forwardRef(function AppNavLink(
  {
    discover = DEFAULT_DISCOVER,
    prefetch = DEFAULT_PREFETCH,
    viewTransition = true,
    ...props
  },
  ref
) {
  return (
    <RouterNavLink
      ref={ref}
      discover={discover}
      prefetch={prefetch}
      viewTransition={viewTransition}
      {...props}
    />
  );
});
