import type { MenuItem } from '@/shared/types';
import { useTheme } from '@/lib/ThemeContext';
import { formatCurrency } from '@/lib/utils';

interface MenuItemCardProps {
  item: MenuItem;
  onClick: () => void;
  onQuickAdd?: () => void;
}

export function MenuItemCard({ item, onClick, onQuickAdd }: MenuItemCardProps) {
  const { theme } = useTheme();

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    onQuickAdd?.();
  };

  return (
    <button
      onClick={onClick}
      className="group w-full text-left transition-all duration-200 active:scale-[0.98]"
    >
      <div 
        className="relative flex gap-3 overflow-hidden rounded-xl p-3 transition-all hover:bg-black/[0.02]"
        style={{ backgroundColor: theme.cardBackground }}
      >
        {/* Content */}
        <div className="flex flex-1 flex-col justify-between min-w-0">
          <div>
            <h3 
              className="font-semibold leading-tight line-clamp-2"
              style={{ color: theme.textColor }}
            >
              {item.name}
            </h3>
            
            {item.description && (
              <p 
                className="mt-1 text-sm leading-snug line-clamp-2"
                style={{ color: `${theme.textColor}70` }}
              >
                {item.description}
              </p>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span 
              className="text-base font-bold"
              style={{ color: theme.textColor }}
            >
              {formatCurrency(item.price)}
            </span>
            
            {item.dietaryTags.length > 0 && (
              <div className="flex gap-1">
                {item.dietaryTags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ 
                      backgroundColor: `${theme.primaryColor}15`,
                      color: theme.primaryColor,
                    }}
                  >
                    {tag === 'GLUTEN_FREE' ? 'GF' : tag === 'DAIRY_FREE' ? 'DF' : tag.charAt(0)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Image */}
        <div className="relative flex-shrink-0">
          {item.imageUrl ? (
            <div className="relative h-24 w-24 overflow-hidden rounded-lg">
              <img
                src={item.imageUrl}
                alt={item.name}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
          ) : (
            <div 
              className="flex h-24 w-24 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${theme.primaryColor}08` }}
            >
              <svg 
                className="h-8 w-8" 
                fill="none" 
                stroke={`${theme.textColor}25`} 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          
          {/* Quick Add Button */}
          {onQuickAdd && (
            <button
              onClick={handleQuickAdd}
              className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full shadow-lg transition-transform active:scale-90"
              style={{ 
                backgroundColor: theme.primaryColor,
                color: '#fff',
              }}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </button>
  );
}
