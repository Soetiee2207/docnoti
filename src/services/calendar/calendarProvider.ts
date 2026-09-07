import type {
  CalendarEvent,
  CreateCalendarEventRequest,
  UpdateCalendarEventRequest,
  CalendarProviderAvailability,
} from "./types"

export interface CalendarProvider {
  readonly id: string
  readonly name: string

  checkAvailability(): Promise<CalendarProviderAvailability>

  createEvent(request: CreateCalendarEventRequest): Promise<CalendarEvent>

  updateEvent(eventId: string, request: UpdateCalendarEventRequest): Promise<CalendarEvent>

  deleteEvent(eventId: string): Promise<void>

  getEvent(eventId: string): Promise<CalendarEvent | null>

  getEventByIdempotencyKey(key: string): Promise<CalendarEvent | null>
}
