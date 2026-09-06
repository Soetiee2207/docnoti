# ADR-011 — Windows Notifications

- Status: Accepted
- Date: 2026-09-07

## Context

docnoti cần thông báo cho người dùng về các sự kiện quan trọng như:

- task đến hạn
- deadline sắp đến
- processing hoàn tất
- processing thất bại
- calendar action cần attention
- các trạng thái background processing cần người dùng biết

Ứng dụng chạy local-first trên Windows, vì vậy notification phải hoạt động
mà không phụ thuộc vào cloud notification service.

## Decision

V1 sử dụng abstraction:

```text
NotificationProvider
```

Application layer gọi `NotificationService`, còn implementation cụ thể nằm
trong infrastructure layer.

```text
Task / Job / System Event
        ↓
NotificationService
        ↓
NotificationProvider
        ↓
Windows Native Notification
```

Windows native notification là provider chính trong V1.

## Notification Boundary

Domain logic không trực tiếp gọi Windows notification API.

Luồng:

```text
Domain Event
    ↓
NotificationService
    ↓
NotificationProvider
    ↓
Windows Notification
```

Điều này giữ Windows-specific implementation ngoài domain layer.

## Notification Types

V1 hỗ trợ các nhóm notification:

```text
TASK_DUE
DEADLINE_APPROACHING
PROCESSING_COMPLETED
PROCESSING_FAILED
ACTION_REQUIRED
```

Có thể bổ sung type mới mà không thay đổi provider contract.

## Notification Content

Notification phải ngắn gọn và có thể hành động.

Ví dụ:

```text
"Deadline sắp đến: Nộp báo cáo tháng"
```

Nếu notification xuất phát từ document analysis, nội dung nên ưu tiên:

- task/deadline title
- thời gian nếu đã được xác định
- trạng thái/action cần người dùng thực hiện

Không đưa toàn bộ source document vào notification.

## Date and Time

Notification scheduler chỉ sử dụng date/time đã được xác định ở application
layer.

Không được notification layer tự suy luận hoặc phát sinh exact date/time.

Ví dụ:

```text
"30/09/2026"
→ có thể schedule

"cuối tháng"
→ chưa đủ để tự tạo notification exact-time nếu chưa được resolve
```

Timezone phải được xử lý nhất quán với application/calendar layer.

## Scheduling

Notification scheduling thuộc application/runtime layer.

Conceptual flow:

```text
Task / Deadline
      ↓
Notification Schedule
      ↓
Background Worker / Runtime
      ↓
NotificationService
      ↓
Windows Provider
```

Notification phải được persist đủ để có thể phục hồi sau application
restart.

Không phụ thuộc vào việc UI đang mở.

## Startup Recovery

Khi application khởi động:

```text
Persisted Notification Schedule
        ↓
Restore / Reconcile
        ↓
Schedule Future Notifications
```

Notification đã quá hạn cần được xử lý theo policy của application.

Không được phát liên tục nhiều notification cũ chỉ vì application vừa
restart.

## Permission / Availability

Nếu Windows notification capability không khả dụng, application phải:

- ghi nhận trạng thái/failure
- giữ task/deadline data
- không làm mất source document hoặc analysis
- cho phép retry hoặc tiếp tục bằng UI/in-app indication

Notification failure không được làm pipeline chính thất bại.

## Idempotency

Notification delivery phải tránh duplicate notification khi worker retry.

Local notification state nên phân biệt được:

```text
PENDING
SENT
FAILED
```

Nếu việc xác nhận delivery của OS không chắc chắn, retry phải tuân theo
policy để tránh spam.

## User Control

Người dùng phải có khả năng kiểm soát notification behavior ở mức phù hợp,
ví dụ:

- enable/disable notifications
- loại notification
- reminder timing khi feature hỗ trợ
- in-app indication khi notification bị disabled

Các preference phải được lưu local.

## Relationship with Tasks

Task là first-class entity.

Notification không thay thế task.

```text
Task
├── due date / deadline
├── status
└── notification schedule
```

Xóa hoặc hoàn thành task phải reconcile các notification liên quan để tránh
notification không còn hợp lệ.

## Relationship with Calendar

Calendar event và notification là hai side effect riêng.

```text
Task / Deadline
   ├── Calendar action
   └── Notification action
```

Việc tạo calendar event không mặc định đồng nghĩa với việc notification phải
được tạo, trừ khi application policy yêu cầu.

## Privacy

Notification content có thể xuất hiện trên màn hình khóa hoặc desktop.

Do đó notification phải áp dụng data minimization.

Không hiển thị:

- toàn bộ document text
- dữ liệu không cần thiết
- credentials
- internal processing details không dành cho người dùng

Chỉ hiển thị thông tin cần thiết để người dùng nhận biết và hành động.

## Consequences

### Positive

- native Windows experience
- không cần cloud notification service
- notification chạy độc lập với UI
- scheduler có thể recover sau restart
- provider có thể thay đổi trong tương lai
- failure không làm mất task/document data

### Negative

- Windows-specific integration cần infrastructure code
- notification delivery semantics phụ thuộc OS
- cần xử lý duplicate/recovery
- notification permission/availability có thể khác giữa môi trường

## Alternatives Rejected

### Cloud push notification service

Rejected vì không phù hợp local-first desktop architecture và không cần
thiết cho V1.

### UI-only notifications

Rejected vì người dùng có thể không mở application khi deadline đến.

### Domain code gọi Windows API trực tiếp

Rejected vì tạo coupling với platform và làm testing khó hơn.

## V1 Scope

V1 tập trung vào:

- Windows native notifications
- persisted notification scheduling
- startup recovery
- task/deadline reminders
- processing success/failure notifications
- user notification preferences
- duplicate/retry handling

Advanced cross-platform push notifications không thuộc scope V1.

## Invariants

1. Domain layer không gọi Windows notification API trực tiếp.
2. Notification đi qua `NotificationService` và `NotificationProvider`.
3. Notification scheduling phải survive application restart.
4. Notification không được tự suy luận exact date/time.
5. Notification failure không làm mất task/document/analysis data.
6. Retry phải có duplicate protection.
7. Notification content phải tuân thủ data minimization.
8. Completed/deleted tasks phải reconcile notification schedules liên quan.
9. Notification preference được lưu local.
10. Windows-specific implementation chỉ nằm trong infrastructure/adapter
    boundary.
