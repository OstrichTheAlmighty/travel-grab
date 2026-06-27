"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function BookingSuccessContent() {
  const params  = useSearchParams();
  const orderId = params.get("order_id");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#F9F9F9] px-4 text-center">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full">
        <div className="text-5xl mb-4">✈️</div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">Booking confirmed!</h1>
        <p className="text-gray-500 text-sm mb-6">
          Your flight has been booked successfully.
          {orderId && (
            <span className="block mt-1 font-mono text-xs text-gray-400">
              Order: {orderId}
            </span>
          )}
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/itinerary"
            className="block w-full text-center bg-[#C8F5C8] hover:bg-[#b8e8b8] text-gray-900 font-bold py-3 px-6 rounded-xl transition-colors"
          >
            View your itinerary
          </Link>
          <Link
            href="/flights"
            className="block w-full text-center text-gray-500 hover:text-gray-700 text-sm py-2 transition-colors"
          >
            Search more flights
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function BookingSuccessPage() {
  return (
    <Suspense>
      <BookingSuccessContent />
    </Suspense>
  );
}
