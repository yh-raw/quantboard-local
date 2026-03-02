import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";

export function getServerAuthSession() {
  return getServerSession(authOptions);
}

