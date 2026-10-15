import KioskClient from '@/components/KioskClient';
import { schoolConfig } from '@/lib/config';
import { currentKioskDevice } from '@/lib/kiosk-auth';
import { isDbConfigured } from '@/lib/db-guard';

export const dynamic = 'force-dynamic';

export default async function KioskPage() {
  const device = await currentKioskDevice();
  const school = schoolConfig();
  if (!device) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="panel p-8 max-w-md text-center">
          <h1 className="text-xl font-bold">This device is not paired</h1>
          <p className="text-muted mt-2 text-sm">Ask the office to open the admin page, choose “Pair a kiosk”, and open the link on this device once.</p>
          {!isDbConfigured() && <p className="mt-3 text-sm" style={{ color: '#92400e' }}>The app has no database connected yet, so pairing is not possible.</p>}
        </div>
      </main>
    );
  }
  return <KioskClient schoolName={school.schoolName} />;
}
