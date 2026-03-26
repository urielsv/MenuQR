import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { menuApi } from '@/shared/api/menuApi';
import { DietaryFilterBar } from './DietaryFilterBar';
import { MenuSectionList } from './MenuSectionList';
import { getSessionId } from '@/lib/utils';
import { UtensilsCrossed } from 'lucide-react';
import type { DietaryTag } from '@/shared/types';
import { useState } from 'react';

function SkeletonLoader() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="h-10 w-48 bg-muted rounded animate-pulse mb-6" />
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 w-24 bg-muted rounded-full animate-pulse flex-shrink-0" />
          ))}
        </div>
        {[...Array(2)].map((_, i) => (
          <div key={i} className="mb-8">
            <div className="h-6 w-32 bg-muted rounded animate-pulse mb-4" />
            <div className="grid grid-cols-1 gap-4">
              {[...Array(3)].map((_, j) => (
                <div key={j} className="bg-card rounded-lg border overflow-hidden">
                  <div className="aspect-video bg-muted animate-pulse" />
                  <div className="p-4 space-y-2">
                    <div className="h-5 w-32 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-full bg-muted rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PublicMenuPage() {
  const { slug } = useParams<{ slug: string }>();
  const [activeFilters, setActiveFilters] = useState<DietaryTag[]>([]);

  const { data: menu, isLoading, error } = useQuery({
    queryKey: ['menu', slug],
    queryFn: () => menuApi.getMenu(slug!),
    enabled: !!slug,
  });

  useEffect(() => {
    if (menu && slug) {
      const sessionId = getSessionId();
      menuApi.recordEvent(slug, {
        eventType: 'MENU_VIEW',
        sessionId,
      });
    }
  }, [menu, slug]);

  const handleFilterChange = (filter: DietaryTag) => {
    setActiveFilters((prev) => {
      const newFilters = prev.includes(filter)
        ? prev.filter((f) => f !== filter)
        : [...prev, filter];
      
      if (!prev.includes(filter) && slug) {
        const sessionId = getSessionId();
        menuApi.recordEvent(slug, {
          eventType: 'FILTER_USED',
          sessionId,
          metadata: { filter },
        });
      }
      
      return newFilters;
    });
  };

  const clearFilters = () => {
    setActiveFilters([]);
  };

  if (isLoading) {
    return <SkeletonLoader />;
  }

  if (error || !menu) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <UtensilsCrossed className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Menu Not Available</h1>
          <p className="text-muted-foreground">
            This menu could not be found or is temporarily unavailable.
          </p>
        </div>
      </div>
    );
  }

  const filteredSections = activeFilters.length === 0
    ? menu.sections
    : menu.sections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) =>
            activeFilters.every((filter) => item.dietaryTags.includes(filter))
          ),
        }))
        .filter((section) => section.items.length > 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-6">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">{menu.restaurantName}</h1>
        </header>

        <DietaryFilterBar
          activeFilters={activeFilters}
          onFilterChange={handleFilterChange}
          onClearAll={clearFilters}
        />

        {filteredSections.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No items match your filters.</p>
            <button
              onClick={clearFilters}
              className="mt-2 text-primary hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <MenuSectionList sections={filteredSections} slug={slug!} />
        )}

        <footer className="mt-12 pt-6 border-t text-center text-sm text-muted-foreground">
          <p>Powered by MenuDigital</p>
        </footer>
      </div>
    </div>
  );
}
