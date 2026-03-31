import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/shared/api/analyticsApi';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const COLORS = ['#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b'];

export function CustomerSegmentsChart() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'segments'],
    queryFn: analyticsApi.getSegments,
  });

  if (isLoading) {
    return <Skeleton className="h-80 w-full" />;
  }

  if (!data || !data.segments || data.segments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Segmentos de Clientes</CardTitle>
          <CardDescription>Generado por Machine Learning</CardDescription>
        </CardHeader>
        <CardContent className="h-64 flex items-center justify-center">
          <p className="text-muted-foreground">Procesando nuevos segmentos. Vuelve mañana.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader>
        <CardTitle>Comportamiento y Segmentos de Clientes</CardTitle>
        <CardDescription>Nuestro modelo de IA agrupó a tus comensales en {data.segments.length} categorías basadas en su navegación de hoy ({new Date(data.date).toLocaleDateString()}).</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.segments}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="percentage"
                  nameKey="name"
                >
                  {data.segments.map((_entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col justify-center space-y-4">
            {data.segments.map((segment: any, idx: number) => (
              <div key={idx} className="flex items-center space-x-4">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                <div className="flex-1">
                  <p className="text-sm font-medium">{segment.name}</p>
                  <p className="text-xs text-muted-foreground">Promedio platos visitados: {segment.avgItemsViewed}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{segment.percentage.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">{segment.count} sesiones</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
