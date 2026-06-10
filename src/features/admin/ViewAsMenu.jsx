import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Eye, UserRound, Users, Trophy, Building2 } from 'lucide-react';

const ROLES = [
  { role: 'athlete', label: 'Athlete', home: '/athlete', icon: UserRound },
  { role: 'parent', label: 'Parent / Guardian', home: '/parent', icon: Users },
  { role: 'coach', label: 'Coach', home: '/coach', icon: Trophy },
  { role: 'organization', label: 'Organization', home: '/organization', icon: Building2 },
];

// Admin-only control to enter "view as role" preview, then jump straight to that
// role's portal. The persistent ViewAsBanner provides the way back.
export default function ViewAsMenu() {
  const { isAdmin, setViewAs } = useAuth();
  const navigate = useNavigate();
  if (!isAdmin) return null;

  const enter = (role, home) => {
    setViewAs(role);
    navigate(home);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Eye className="h-4 w-4" aria-hidden="true" /> View as role
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Preview the experience</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ROLES.map(({ role, label, home, icon: Icon }) => (
          <DropdownMenuItem key={role} onClick={() => enter(role, home)} className="gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
