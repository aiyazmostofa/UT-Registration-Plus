import { Serialized } from 'chrome-extension-toolkit';
import { CourseSchedule } from './CourseSchedule';
import { CourseColors } from './ThemeColors';
import { getCourseColors } from '@shared/util/colors';

export class Commitment {
    uniqueId!: number;
    number!: string;
    fullName!: string;
    courseName!: string;
    description?: string[];
    schedule: CourseSchedule;
    colors: CourseColors;
    constructor(course: Serialized<Commitment>) {
        Object.assign(this, course);
        this.schedule = new CourseSchedule(course.schedule);
        this.colors = course.colors ? structuredClone(course.colors) : getCourseColors('emerald', 500);
    }
}
