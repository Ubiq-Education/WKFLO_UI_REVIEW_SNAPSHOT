import React from "react";
import { Redirect } from "wouter";
import { useSuperPowerUser } from "@/hooks/use-super-power-user";

interface SuperPowerUserRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
}

/** Renders children for super power users only; everyone else is redirected. UI-only guard. */
const SuperPowerUserRoute: React.FC<SuperPowerUserRouteProps> = ({
  children,
  redirectTo = "/marketplace/browse",
}) => {
  const { isSuperPowerUser, isLoading } = useSuperPowerUser();

  if (isLoading) return null;
  if (!isSuperPowerUser) return <Redirect to={redirectTo} replace />;
  return <>{children}</>;
};

export default SuperPowerUserRoute;
